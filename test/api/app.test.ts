import { Writable } from 'node:stream';

import { pino } from 'pino';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { LOG_REDACTIONS } from '../../src/api/app.js';
import { DependencyUnavailableError } from '../../src/domain/errors.js';
import {
  ADMIN_KEY,
  GATEWAY_SECRET,
  MERCHANT,
  MERCHANT_KEY,
  PAYMENT_ID,
  testApp,
} from '../support/fakes.js';

const asMerchant = { 'X-Merchant-Key': MERCHANT_KEY };
// Every port call ends with the request's call context.
const CONTEXT = expect.objectContaining({ correlationId: expect.any(String) });

describe('platform rules', () => {
  it('health answers without any key, even with the gateway check on', async () => {
    const { app } = testApp({ gatewaySecret: GATEWAY_SECRET });
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'UP' });
  });

  it('refuses requests that did not come through the API Gateway', async () => {
    const { app } = testApp({ gatewaySecret: GATEWAY_SECRET });
    const direct = await request(app).get('/aggregated-data').set(asMerchant);
    expect(direct.status).toBe(403);
    expect(direct.type).toBe('application/problem+json');
    const wrong = await request(app).get('/aggregated-data').set(asMerchant).set('X-Gateway-Secret', 'wrong');
    expect(wrong.status).toBe(403);
    const viaGateway = await request(app).get('/aggregated-data').set(asMerchant).set('X-Gateway-Secret', GATEWAY_SECRET);
    expect(viaGateway.status).toBe(200);
  });

  it('keeps or creates the X-Correlation-Id and passes it downstream', async () => {
    const { app, authenticator } = testApp();
    const kept = await request(app).get('/merchants/me').set(asMerchant).set('X-Correlation-Id', 'abc-123');
    expect(kept.headers['x-correlation-id']).toBe('abc-123');
    expect(authenticator.contexts.at(-1)).toEqual({ correlationId: 'abc-123' });

    const created = await request(app).get('/merchants/me').set(asMerchant).set('X-Correlation-Id', 'bad id!');
    expect(created.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('answers unknown routes and malformed JSON with Problem Details', async () => {
    const { app } = testApp();
    const missing = await request(app).get('/nope');
    expect(missing.status).toBe(404);
    expect(missing.body.detail).toBe('No route for GET /nope');

    const malformed = await request(app).post('/merchants').set('Content-Type', 'application/json').send('{"name":');
    expect(malformed.status).toBe(400);
    expect(malformed.body.detail).toBe('The body is not valid JSON');
  });

  it('allows the configured frontend origin and exposes the headers it reads', async () => {
    const { app } = testApp({ corsOrigins: ['http://localhost:5173'] });
    const preflight = await request(app).options('/payments')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'x-merchant-key,idempotency-key,content-type');
    expect(preflight.status).toBe(204);
    expect(preflight.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(preflight.headers['access-control-allow-headers']).toContain('Idempotency-Key');

    const other = await request(app).get('/health').set('Origin', 'https://evil.example');
    expect(other.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('never writes the merchant key to the logs', async () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _encoding, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const { app } = testApp({}, pino({ level: 'info', redact: { paths: LOG_REDACTIONS, censor: '****' } }, sink));
    await request(app).get('/merchants/me').set(asMerchant).set('X-Admin-Key', ADMIN_KEY);
    expect(lines.join('')).toContain('/merchants/me');
    expect(lines.join('')).not.toContain(MERCHANT_KEY);
    expect(lines.join('')).not.toContain(ADMIN_KEY);
  });
});

describe('merchant authentication', () => {
  it('needs a valid X-Merchant-Key', async () => {
    const { app } = testApp();
    for (const headers of [{}, { 'X-Merchant-Key': 'unknown-key' }]) {
      const response = await request(app).get('/aggregated-data').set(headers);
      expect(response.status).toBe(401);
      expect(response.headers['www-authenticate']).toBe('ApiKey header="X-Merchant-Key"');
      expect(response.body.detail).toBe('Missing or invalid merchant key');
    }
  });

  it('answers 504 (not 401) when the merchant-service does not answer', async () => {
    const { app, authenticator } = testApp();
    authenticator.failure = new DependencyUnavailableError('merchant-service', 'timeout', 'merchant-service did not answer in 2000 ms');
    const response = await request(app).get('/aggregated-data').set(asMerchant);
    expect(response.status).toBe(504);
    expect(response.body).toMatchObject({ dependency: 'merchant-service', detail: 'merchant-service did not answer in 2000 ms' });
  });
});

describe('GET /aggregated-data', () => {
  it('answers the whole panel in one JSON', async () => {
    const { app } = testApp();
    const response = await request(app).get('/aggregated-data').set(asMerchant);
    expect(response.status).toBe(200);
    expect(response.body.merchant).toEqual({ id: MERCHANT.id, name: MERCHANT.name, webhookConfigured: true });
    expect(response.body.summary.totalAmount).toBe(125000);
    expect(response.body.recentPayments.map((payment: { id: string }) => payment.id)).toEqual(['p2', 'p1']);
    expect(response.body.fees.totalFees).toBe(3488);
    expect(response.body.warnings).toEqual([]);
    expect(response.body.generatedAt).toBe('2026-10-26T15:00:00.000Z');
  });

  it('still answers when a part fails, with the reason in warnings', async () => {
    const { app, fees } = testApp();
    fees.result = new DependencyUnavailableError('calculate-fees', 'unreachable', 'calculate-fees is unreachable');
    const response = await request(app).get('/aggregated-data').set(asMerchant);
    expect(response.status).toBe(200);
    expect(response.body.fees).toBeNull();
    expect(response.body.warnings).toEqual([
      { part: 'fees', dependency: 'calculate-fees', reason: 'unreachable', message: 'calculate-fees is unreachable' },
    ]);
  });
});

describe('merchant account and administration', () => {
  it('returns the authenticated merchant without another call', async () => {
    const { app, merchants } = testApp();
    const response = await request(app).get('/merchants/me').set(asMerchant);
    expect(response.body).toEqual(MERCHANT);
    expect(merchants.calls).toEqual([]);
  });

  it('changes only the own profile, keeping the status', async () => {
    const { app, merchants } = testApp();
    await request(app).put('/merchants/me').set(asMerchant).send({ name: 'Nova', email: 'nova@loja.com', status: 'SUSPENDED' });
    expect(merchants.last()).toMatchObject({
      method: 'update',
      args: [MERCHANT.id, { name: 'Nova', email: 'nova@loja.com', status: 'ACTIVE' }, CONTEXT],
    });
  });

  it('lists every invalid field before calling anyone', async () => {
    const { app, merchants } = testApp();
    const response = await request(app).put('/merchants/me/webhook').set(asMerchant).send({ url: 42 });
    expect(response.status).toBe(400);
    expect(response.body.detail).toContain('url:');
    expect(response.body.detail).toContain('events:');
    expect(merchants.calls).toEqual([]);
  });

  it('configures the webhook and rotates the key of the authenticated merchant', async () => {
    const { app, merchants } = testApp();
    await request(app).put('/merchants/me/webhook').set(asMerchant)
      .send({ url: 'https://loja.example/hooks', events: ['payment.confirmed'] });
    expect(merchants.last()).toMatchObject({
      method: 'configureWebhook',
      args: [MERCHANT.id, { url: 'https://loja.example/hooks', events: ['payment.confirmed'] }, CONTEXT],
    });
    await request(app).post('/merchants/me/api-key').set(asMerchant);
    expect(merchants.last()).toMatchObject({ method: 'rotateApiKey', args: [MERCHANT.id, CONTEXT] });
  });

  it('signs up without a key and passes the service answer on, with the BFF Location', async () => {
    const { app, merchants } = testApp();
    merchants.reply = {
      status: 201,
      body: { merchant: { id: 'new' }, apiKey: 'pf_new' },
      headers: { location: '/v1/merchants/new', 'content-type': 'application/json' },
    };
    const response = await request(app).post('/merchants')
      .send({ name: 'Loja', email: 'a@loja.com', document: '12345678000190', extra: 'ignored' });
    expect(response.status).toBe(201);
    expect(response.headers.location).toBe('/merchants/new');
    expect(response.body.apiKey).toBe('pf_new');
    expect(merchants.last().args[0]).toEqual({ name: 'Loja', email: 'a@loja.com', document: '12345678000190' });
  });

  it('administration needs ADMIN_KEY configured and sent', async () => {
    const disabled = testApp();
    expect((await request(disabled.app).get('/merchants').set('X-Admin-Key', ADMIN_KEY)).status).toBe(404);

    const { app, merchants } = testApp({ adminKey: ADMIN_KEY });
    const noKey = await request(app).get('/merchants');
    expect(noKey.status).toBe(401);
    expect(noKey.headers['www-authenticate']).toBe('ApiKey header="X-Admin-Key"');
    expect((await request(app).get('/merchants').set(asMerchant)).status).toBe(401);

    const listed = await request(app).get('/merchants?status=SUSPENDED&size=5').set('X-Admin-Key', ADMIN_KEY);
    expect(listed.status).toBe(200);
    expect(merchants.last()).toMatchObject({ method: 'list', args: [{ status: 'SUSPENDED', size: 5 }, CONTEXT] });

    expect((await request(app).get('/merchants/not-a-uuid').set('X-Admin-Key', ADMIN_KEY)).status).toBe(400);
    await request(app).delete(`/merchants/${MERCHANT.id}`).set('X-Admin-Key', ADMIN_KEY);
    expect(merchants.last()).toMatchObject({ method: 'remove', args: [MERCHANT.id, CONTEXT] });
  });
});

describe('payments proxy', () => {
  it('creates with the authenticated merchant, never one sent by the frontend', async () => {
    const { app, payments } = testApp();
    payments.reply = {
      status: 201,
      body: { id: PAYMENT_ID, status: 'AUTHORIZED' },
      headers: { location: `/v1/payments/${PAYMENT_ID}`, 'content-type': 'application/json', 'idempotent-replayed': 'true' },
    };
    const response = await request(app).post('/payments').set(asMerchant)
      .set('Idempotency-Key', 'pedido-42')
      .set('X-Merchant-Id', '00000000-0000-0000-0000-000000000999')
      .send({ amount: 1990, method: 'CARD', cardToken: 'tok_approved', merchantId: 'spoofed' });

    expect(response.status).toBe(201);
    expect(response.headers.location).toBe(`/payments/${PAYMENT_ID}`);
    expect(response.headers['idempotent-replayed']).toBe('true');
    expect(payments.last()).toMatchObject({
      method: 'create',
      args: [MERCHANT.id, { amount: 1990, method: 'CARD', cardToken: 'tok_approved' }, 'pedido-42', CONTEXT],
    });
  });

  it('needs an Idempotency-Key to create or refund', async () => {
    const { app, payments } = testApp();
    const create = await request(app).post('/payments').set(asMerchant).send({ amount: 1990, method: 'PIX' });
    expect(create.status).toBe(400);
    expect(create.body.detail).toContain('Idempotency-Key');
    const refund = await request(app).post(`/payments/${PAYMENT_ID}/refunds`).set(asMerchant);
    expect(refund.status).toBe(400);
    expect(payments.calls).toEqual([]);
  });

  it('passes the service errors on as Problem Details', async () => {
    const { app, payments } = testApp();
    payments.reply = {
      status: 422,
      body: { title: 'Unprocessable Content', status: 422, detail: 'Idempotency-Key was already used with a different request' },
      headers: { 'content-type': 'application/problem+json' },
    };
    const response = await request(app).post('/payments').set(asMerchant).set('Idempotency-Key', 'k')
      .send({ amount: 1, method: 'PIX' });
    expect(response.status).toBe(422);
    expect(response.type).toBe('application/problem+json');
    expect(response.body.detail).toContain('different request');
  });

  it('forwards only the known list filters', async () => {
    const { app, payments } = testApp();
    await request(app).get('/payments?status=PENDING&method=PIX&page=1&size=10&merchantId=other').set(asMerchant);
    expect(payments.last()).toMatchObject({
      method: 'list',
      args: [MERCHANT.id, { status: 'PENDING', method: 'PIX', page: '1', size: '10' }, CONTEXT],
    });
  });

  it('routes detail, change, cancel, refund and PIX confirmation', async () => {
    const { app, payments } = testApp();
    await request(app).get(`/payments/${PAYMENT_ID}`).set(asMerchant);
    await request(app).patch(`/payments/${PAYMENT_ID}`).set(asMerchant).send({ description: 'Pedido 42' });
    await request(app).delete(`/payments/${PAYMENT_ID}`).set(asMerchant);
    await request(app).post(`/payments/${PAYMENT_ID}/refunds`).set(asMerchant).set('Idempotency-Key', 'r1');
    await request(app).post(`/payments/${PAYMENT_ID}/pix-confirmation`).set(asMerchant);
    expect(payments.calls.map((call) => call.method)).toEqual(['get', 'update', 'cancel', 'refund', 'confirmPix']);
    expect(payments.calls[3]?.args.slice(0, 4)).toEqual([MERCHANT.id, PAYMENT_ID, {}, 'r1']);
    expect((await request(app).get('/payments/abc').set(asMerchant)).status).toBe(400);
  });

  it('answers 502 when the payment-service is down', async () => {
    const { app, payments } = testApp();
    payments.failure = new DependencyUnavailableError('payment-service', 'unreachable', 'payment-service is unreachable');
    const response = await request(app).get(`/payments/${PAYMENT_ID}`).set(asMerchant);
    expect(response.status).toBe(502);
    expect(response.body.dependency).toBe('payment-service');
  });
});

describe('Swagger', () => {
  it('serves the UI at /docs/ and the document next to it', async () => {
    const { app } = testApp();
    const redirect = await request(app).get('/docs');
    expect(redirect.status).toBe(301);
    expect(redirect.headers.location).toBe('docs/');

    const page = await request(app).get('/docs/');
    expect(page.status).toBe(200);
    expect(page.text).toContain('swagger-ui');

    const document = await request(app).get('/docs/openapi.json');
    expect(Object.keys(document.body.paths)).toEqual(expect.arrayContaining([
      '/aggregated-data', '/merchants/me', '/payments', '/payments/{id}/refunds',
    ]));
  });
});

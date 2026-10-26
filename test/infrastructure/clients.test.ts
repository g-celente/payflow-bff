import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DependencyUnavailableError } from '../../src/domain/errors.js';
import { FeesClient } from '../../src/infrastructure/clients/fees-client.js';
import { ServiceHttpClient } from '../../src/infrastructure/clients/http.js';
import { MerchantClient } from '../../src/infrastructure/clients/merchant-client.js';
import { PaymentClient } from '../../src/infrastructure/clients/payment-client.js';
import { FEES, MERCHANT, MERCHANT_KEY, SUMMARY } from '../support/fakes.js';

// A real HTTP server playing the services, so the clients run their actual fetch code.
interface Received {
  method: string;
  url: string;
  headers: IncomingHttpHeaders;
  body: string;
}

type Answer = { status: number; body?: unknown; headers?: Record<string, string>; delayMs?: number };

let server: Server;
let baseUrl: string;
let answer: Answer;
let received: Received[];

beforeAll(async () => {
  server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => (body += chunk));
    request.on('end', () => {
      received.push({ method: request.method ?? '', url: request.url ?? '', headers: request.headers, body });
      setTimeout(() => {
        response.writeHead(answer.status, { 'content-type': 'application/json', ...answer.headers });
        response.end(answer.body === undefined ? '' : typeof answer.body === 'string' ? answer.body : JSON.stringify(answer.body));
      }, answer.delayMs ?? 0);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => {
  server.closeAllConnections();
  server.close();
});

beforeEach(() => {
  answer = { status: 200, body: {} };
  received = [];
});

const context = { correlationId: 'corr-42' };
const INTERNAL_KEY = 'internal-key-0123456789abcdef0123456789';

describe('ServiceHttpClient', () => {
  it('sends the correlation id, default headers and query, and reads JSON', async () => {
    answer = { status: 201, body: { ok: true }, headers: { location: '/v1/x/1' } };
    const client = new ServiceHttpClient('svc', baseUrl, { 'x-default': 'yes' });
    const result = await client.call({
      method: 'POST', path: '/v1/x', query: { page: 0, skip: undefined }, body: { a: 1 }, timeoutMs: 1000, context,
    });
    expect(result.status).toBe(201);
    expect(result.body).toEqual({ ok: true });
    expect(received[0]).toMatchObject({ method: 'POST', url: '/v1/x?page=0', body: '{"a":1}' });
    expect(received[0]?.headers).toMatchObject({
      'x-correlation-id': 'corr-42', 'x-default': 'yes', 'content-type': 'application/json',
    });
  });

  it('turns a slow answer into a timeout', async () => {
    answer = { status: 200, body: {}, delayMs: 300 };
    const client = new ServiceHttpClient('payment-service', baseUrl);
    await expect(client.call({ method: 'GET', path: '/', timeoutMs: 50, context })).rejects.toMatchObject({
      dependency: 'payment-service', reason: 'timeout', message: 'payment-service did not answer in 50 ms',
    });
  });

  it('turns a refused connection into unreachable', async () => {
    const client = new ServiceHttpClient('merchant-service', 'http://127.0.0.1:1');
    const failure = await client.call({ method: 'GET', path: '/', timeoutMs: 1000, context }).catch((error) => error);
    expect(failure).toBeInstanceOf(DependencyUnavailableError);
    expect(failure.reason).toBe('unreachable');
  });

  it('returns error answers as they came, and keeps non-JSON bodies as text', async () => {
    answer = { status: 503, body: 'down', headers: { 'content-type': 'text/plain', 'retry-after': '30' } };
    const client = new ServiceHttpClient('svc', baseUrl);
    const result = await client.call({ method: 'GET', path: '/', timeoutMs: 1000, context });
    expect(result.status).toBe(503);
    expect(result.body).toBe('down');
  });
});

describe('MerchantClient', () => {
  const client = () => new MerchantClient(new ServiceHttpClient('merchant-service', baseUrl), {
    internalKey: INTERNAL_KEY, authTimeoutMs: 1000, proxyTimeoutMs: 1000,
  });

  it('authenticates with the merchant key only', async () => {
    answer = { status: 200, body: { ...MERCHANT, createdAt: 'x', updatedAt: 'y' } };
    expect(await client().authenticate(MERCHANT_KEY, context)).toEqual(MERCHANT);
    expect(received[0]?.url).toBe('/v1/merchants/me');
    expect(received[0]?.headers['x-merchant-key']).toBe(MERCHANT_KEY);
    expect(received[0]?.headers['x-internal-key']).toBeUndefined();
  });

  it('maps 401 to no merchant and anything unexpected to a dependency failure', async () => {
    answer = { status: 401, body: { status: 401 } };
    expect(await client().authenticate('bad', context)).toBeNull();
    answer = { status: 500, body: {} };
    await expect(client().authenticate('bad', context)).rejects.toMatchObject({ reason: 'bad-response' });
    answer = { status: 200, body: { id: 1 } };
    await expect(client().authenticate('bad', context)).rejects.toMatchObject({ reason: 'bad-response' });
  });

  it('calls the internal routes with X-Internal-Key and passes the reply on', async () => {
    answer = { status: 201, body: { apiKey: 'pf_x' }, headers: { location: '/v1/merchants/1' } };
    const reply = await client().create({ name: 'Loja', email: 'a@b.co', document: '12345678901' }, context);
    expect(reply).toEqual({
      status: 201,
      body: { apiKey: 'pf_x' },
      headers: { 'content-type': 'application/json', location: '/v1/merchants/1' },
    });
    expect(received[0]?.headers['x-internal-key']).toBe(INTERNAL_KEY);
    expect(JSON.parse(received[0]?.body ?? '')).toEqual({ name: 'Loja', email: 'a@b.co', document: '12345678901' });
  });
});

describe('PaymentClient', () => {
  const client = () => new PaymentClient(new ServiceHttpClient('payment-service', baseUrl), {
    internalKey: INTERNAL_KEY, panelTimeoutMs: 1000, proxyTimeoutMs: 1000,
  });

  it('reads the summary and the latest payments for the merchant', async () => {
    answer = { status: 200, body: SUMMARY };
    expect(await client().summary(MERCHANT.id, context)).toEqual(SUMMARY);
    expect(received[0]?.headers).toMatchObject({ 'x-merchant-id': MERCHANT.id, 'x-internal-key': INTERNAL_KEY });

    answer = { status: 200, body: { items: [{ id: 'p', amount: 1, currency: 'BRL', method: 'PIX', status: 'PENDING', createdAt: 'x', extra: 1 }] } };
    expect(await client().recent(MERCHANT.id, 5, context)).toEqual([
      { id: 'p', amount: 1, currency: 'BRL', method: 'PIX', status: 'PENDING', createdAt: 'x' },
    ]);
    expect(received[1]?.url).toBe('/v1/payments?page=0&size=5');
  });

  it('sends the Idempotency-Key and forwards Location and replay headers', async () => {
    answer = { status: 201, body: { id: 'p' }, headers: { location: '/v1/payments/p', 'idempotent-replayed': 'true' } };
    const reply = await client().create(MERCHANT.id, { amount: 100, method: 'PIX' }, 'k-1', context);
    expect(received[0]?.headers['idempotency-key']).toBe('k-1');
    expect(reply.headers).toMatchObject({ location: '/v1/payments/p', 'idempotent-replayed': 'true' });
  });
});

describe('FeesClient', () => {
  it('posts the totals by method with the function key', async () => {
    answer = { status: 200, body: FEES };
    const client = new FeesClient(new ServiceHttpClient('calculate-fees', `${baseUrl}/api/fees`), 'fn-key', 1000);
    expect(await client.calculate({ CARD: 90000, PIX: 35000 }, 'BRL', context)).toEqual(FEES);
    expect(received[0]).toMatchObject({ method: 'POST', url: '/api/fees' });
    expect(received[0]?.headers['x-functions-key']).toBe('fn-key');
    expect(JSON.parse(received[0]?.body ?? '')).toEqual({ byMethod: { CARD: 90000, PIX: 35000 }, currency: 'BRL' });
  });

  it('reports not-configured without a URL', async () => {
    await expect(new FeesClient(null, undefined, 1000).calculate({}, 'BRL', context))
      .rejects.toMatchObject({ dependency: 'calculate-fees', reason: 'not-configured' });
  });
});

import { describe, expect, it } from 'vitest';

import { DependencyUnavailableError, InvalidRequestError } from '../../src/domain/errors.js';
import { getAggregatedData } from '../../src/features/aggregated-data/handler.js';
import { updateOwnProfile } from '../../src/features/merchants-proxy/handler.js';
import type { MerchantsApi } from '../../src/features/merchants-proxy/ports.js';
import { createPayment, requireIdempotencyKey } from '../../src/features/payments-proxy/handler.js';
import type { PaymentsApi } from '../../src/features/payments-proxy/ports.js';
import { FakeFees, FakeFigures, FEES, MERCHANT, Recorder, RECENT, SUMMARY } from '../support/fakes.js';

const context = { correlationId: 'corr-1' };
const now = () => new Date('2026-10-26T15:00:00Z');

describe('getAggregatedData', () => {
  it('joins merchant, summary, recent payments and fees calculated from the summary', async () => {
    const figures = new FakeFigures();
    const fees = new FakeFees();
    const dashboard = await getAggregatedData(MERCHANT, { payments: figures, fees, now }, context);

    expect(dashboard.summary).toEqual(SUMMARY);
    expect(dashboard.recentPayments).toHaveLength(RECENT.length);
    expect(dashboard.fees).toEqual(FEES);
    expect(dashboard.warnings).toEqual([]);
    expect(fees.received).toEqual([SUMMARY.byMethod]);
  });

  it('asks for summary and recent payments in parallel', async () => {
    // Both calls wait on the same gate: if they ran one after the other, the second would never start.
    const started: string[] = [];
    let open!: () => void;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const payments = {
      summary: async () => {
        started.push('summary');
        await gate;
        return SUMMARY;
      },
      recent: async () => {
        started.push('recent');
        await gate;
        return RECENT;
      },
    };
    const dashboard = getAggregatedData(MERCHANT, { payments, fees: new FakeFees(), now }, context);
    expect(started).toEqual(['summary', 'recent']);
    open();
    expect((await dashboard).warnings).toEqual([]);
  });

  it('turns a failed summary into warnings and skips the fees', async () => {
    const figures = new FakeFigures();
    figures.summaryResult = new DependencyUnavailableError('payment-service', 'timeout', 'payment-service did not answer in 2000 ms');
    const fees = new FakeFees();
    const dashboard = await getAggregatedData(MERCHANT, { payments: figures, fees, now }, context);

    expect(dashboard.summary).toBeNull();
    expect(dashboard.fees).toBeNull();
    expect(dashboard.recentPayments).not.toBeNull();
    expect(dashboard.warnings.map((warning) => [warning.part, warning.reason])).toEqual([
      ['summary', 'timeout'],
      ['fees', 'skipped'],
    ]);
    expect(fees.received).toEqual([]);
  });

  it('keeps the rest of the panel when the fees or the recent payments fail', async () => {
    const figures = new FakeFigures();
    figures.recentResult = new DependencyUnavailableError('payment-service', 'unreachable', 'payment-service is unreachable');
    const fees = new FakeFees();
    fees.result = new DependencyUnavailableError('calculate-fees', 'not-configured', 'calculate-fees is not configured');
    const dashboard = await getAggregatedData(MERCHANT, { payments: figures, fees, now }, context);

    expect(dashboard.summary).toEqual(SUMMARY);
    expect(dashboard.recentPayments).toBeNull();
    expect(dashboard.fees).toBeNull();
    expect(dashboard.warnings.map((warning) => warning.part)).toEqual(['recentPayments', 'fees']);
  });
});

describe('proxy handlers', () => {
  it('own profile changes keep the merchant status and target the authenticated id', async () => {
    const recorder = new Recorder();
    await updateOwnProfile(recorder.api<MerchantsApi>(), { ...MERCHANT, status: 'SUSPENDED' },
      { name: 'Nova', email: 'nova@loja.com' }, context);
    expect(recorder.last()).toEqual({
      method: 'update',
      args: [MERCHANT.id, { name: 'Nova', email: 'nova@loja.com', status: 'SUSPENDED' }, context],
    });
  });

  it('payment creation needs an Idempotency-Key and rewrites the Location', async () => {
    const recorder = new Recorder();
    recorder.reply = { status: 201, body: {}, headers: { location: '/v1/payments/abc' } };
    const api = recorder.api<PaymentsApi>();
    const payment = { amount: 100, method: 'CARD' as const, cardToken: 'tok_approved' };

    await expect(createPayment(api, MERCHANT, payment, undefined, context)).rejects.toBeInstanceOf(InvalidRequestError);
    expect(recorder.calls).toEqual([]);

    const reply = await createPayment(api, MERCHANT, payment, 'key-1', context);
    expect(reply.headers.location).toBe('/payments/abc');
    expect(recorder.last().args).toEqual([MERCHANT.id, payment, 'key-1', context]);
  });

  it('rejects blank or oversized idempotency keys', () => {
    for (const key of [undefined, '', '   ', 'x'.repeat(256)]) {
      expect(() => requireIdempotencyKey(key)).toThrow(InvalidRequestError);
    }
    expect(requireIdempotencyKey('pedido-42')).toBe('pedido-42');
  });
});

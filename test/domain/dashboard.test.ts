import { describe, expect, it } from 'vitest';

import { withBffLocation } from '../../src/domain/context.js';
import { buildDashboard, feesSkippedWarning, warningFor } from '../../src/domain/dashboard.js';
import { DependencyUnavailableError } from '../../src/domain/errors.js';
import { FEES, MERCHANT, RECENT, SUMMARY } from '../support/fakes.js';

describe('buildDashboard', () => {
  it('shows only the public merchant fields and the newest payments first', () => {
    const older = Array.from({ length: 7 }, (_, index) => ({
      ...RECENT[0]!,
      id: `old-${index}`,
      createdAt: `2026-10-0${index + 1}T00:00:00Z`,
    }));
    const dashboard = buildDashboard({
      merchant: MERCHANT,
      summary: SUMMARY,
      recentPayments: [...older, ...RECENT],
      fees: FEES,
      warnings: [],
      generatedAt: new Date('2026-10-26T15:00:00Z'),
    });

    expect(dashboard.merchant).toEqual({ id: MERCHANT.id, name: 'Demo Merchant', webhookConfigured: true });
    expect(dashboard.recentPayments?.map((payment) => payment.id)).toEqual(['p2', 'p1', 'old-6', 'old-5', 'old-4']);
    expect(dashboard.generatedAt).toBe('2026-10-26T15:00:00.000Z');
  });

  it('keeps missing parts as null', () => {
    const dashboard = buildDashboard({
      merchant: MERCHANT,
      summary: null,
      recentPayments: null,
      fees: null,
      warnings: [feesSkippedWarning()],
      generatedAt: new Date(),
    });
    expect(dashboard.summary).toBeNull();
    expect(dashboard.recentPayments).toBeNull();
    expect(dashboard.warnings).toHaveLength(1);
  });
});

describe('warningFor', () => {
  it('explains which dependency failed and why', () => {
    const warning = warningFor('fees', new DependencyUnavailableError('calculate-fees', 'timeout', 'calculate-fees did not answer in 2000 ms'));
    expect(warning).toEqual({
      part: 'fees',
      dependency: 'calculate-fees',
      reason: 'timeout',
      message: 'calculate-fees did not answer in 2000 ms',
    });
  });

  it('does not leak unexpected errors', () => {
    const warning = warningFor('summary', new Error('SQL password is wrong'));
    expect(warning.message).not.toContain('password');
    expect(warning.reason).toBe('bad-response');
  });
});

describe('withBffLocation', () => {
  it('rewrites the service path to the BFF path and keeps other headers', () => {
    const reply = withBffLocation(
      { status: 201, body: {}, headers: { location: `/v1/payments/abc`, 'content-type': 'application/json' } },
      '/v1/payments',
      '/payments',
    );
    expect(reply.headers).toEqual({ location: '/payments/abc', 'content-type': 'application/json' });
  });

  it('leaves replies without that Location untouched', () => {
    const reply = { status: 200, body: {}, headers: {} };
    expect(withBffLocation(reply, '/v1/payments', '/payments')).toBe(reply);
  });
});

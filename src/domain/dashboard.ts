import type { AuthenticatedMerchant } from './merchant.js';
import { DependencyUnavailableError, type DependencyFailure } from './errors.js';

export const RECENT_PAYMENTS_LIMIT = 5;

// Totals from the payment-service (cents). byMethod is the approved volume net of refunds.
export interface PaymentSummary {
  readonly currency: string;
  readonly totalAmount: number;
  readonly count: number;
  readonly byStatus: Readonly<Record<string, number>>;
  readonly byMethod: Readonly<Record<string, number>>;
}

export interface RecentPayment {
  readonly id: string;
  readonly amount: number;
  readonly currency: string;
  readonly method: string;
  readonly status: string;
  readonly createdAt: string;
}

// Answer of the calculate-fees Function (cents).
export interface Fees {
  readonly totalFees: number;
  readonly netAmount: number;
  readonly byMethod: readonly FeeLine[];
}

export interface FeeLine {
  readonly method: string;
  readonly gross: number;
  readonly rate: number;
  readonly fee: number;
  readonly settlement: string;
}

export type DashboardPart = 'summary' | 'recentPayments' | 'fees';

// One part of the panel that could not be filled; the part itself is null.
export interface DashboardWarning {
  readonly part: DashboardPart;
  readonly dependency: string;
  readonly reason: DependencyFailure | 'skipped';
  readonly message: string;
}

// GET /aggregated-data: one JSON with everything the panel shows.
export interface Dashboard {
  readonly merchant: { readonly id: string; readonly name: string; readonly webhookConfigured: boolean };
  readonly summary: PaymentSummary | null;
  readonly recentPayments: readonly RecentPayment[] | null;
  readonly fees: Fees | null;
  readonly warnings: readonly DashboardWarning[];
  readonly generatedAt: string;
}

export interface DashboardParts {
  readonly merchant: AuthenticatedMerchant;
  readonly summary: PaymentSummary | null;
  readonly recentPayments: readonly RecentPayment[] | null;
  readonly fees: Fees | null;
  readonly warnings: readonly DashboardWarning[];
  readonly generatedAt: Date;
}

export function buildDashboard(parts: DashboardParts): Dashboard {
  return {
    merchant: {
      id: parts.merchant.id,
      name: parts.merchant.name,
      webhookConfigured: parts.merchant.webhookConfigured,
    },
    summary: parts.summary,
    recentPayments: parts.recentPayments === null ? null : newestFirst(parts.recentPayments),
    fees: parts.fees,
    warnings: parts.warnings,
    generatedAt: parts.generatedAt.toISOString(),
  };
}

export function warningFor(part: DashboardPart, failure: unknown): DashboardWarning {
  if (failure instanceof DependencyUnavailableError) {
    return { part, dependency: failure.dependency, reason: failure.reason, message: failure.message };
  }
  return { part, dependency: 'unknown', reason: 'bad-response', message: `Unexpected failure while loading ${part}` };
}

// Fees are calculated from the summary, so without it there is nothing to send to the Function.
export function feesSkippedWarning(): DashboardWarning {
  return {
    part: 'fees',
    dependency: 'calculate-fees',
    reason: 'skipped',
    message: 'Fees need the payment summary, which is unavailable',
  };
}

function newestFirst(payments: readonly RecentPayment[]): RecentPayment[] {
  return [...payments]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, RECENT_PAYMENTS_LIMIT);
}

import type { CallContext } from '../../domain/context.js';
import type { Fees, PaymentSummary, RecentPayment } from '../../domain/dashboard.js';

// Implemented by the payment-service client.
export interface PaymentFigures {
  summary(merchantId: string, context: CallContext): Promise<PaymentSummary>;
  recent(merchantId: string, limit: number, context: CallContext): Promise<RecentPayment[]>;
}

// Implemented by the calculate-fees Function client.
export interface FeeCalculator {
  calculate(byMethod: Readonly<Record<string, number>>, currency: string, context: CallContext): Promise<Fees>;
}

export interface AggregatedDataPorts {
  readonly payments: PaymentFigures;
  readonly fees: FeeCalculator;
  readonly now: () => Date;
}

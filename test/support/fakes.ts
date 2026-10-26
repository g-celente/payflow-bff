import { pino, type Logger } from 'pino';

import { createApp, type AppDependencies, type AppSettings } from '../../src/api/app.js';
import type { CallContext, ServiceReply } from '../../src/domain/context.js';
import type { Fees, PaymentSummary, RecentPayment } from '../../src/domain/dashboard.js';
import type { AuthenticatedMerchant, MerchantAuthenticator } from '../../src/domain/merchant.js';
import type { FeeCalculator, PaymentFigures } from '../../src/features/aggregated-data/ports.js';
import type { MerchantsApi } from '../../src/features/merchants-proxy/ports.js';
import type { PaymentsApi } from '../../src/features/payments-proxy/ports.js';

export const MERCHANT_KEY = 'merchant-key-0123456789abcdef0123456789';
export const ADMIN_KEY = 'admin-key-0123456789abcdef0123456789abcd';
export const GATEWAY_SECRET = 'gateway-secret-0123456789';
export const PAYMENT_ID = '9f8e7d6c-5b4a-4321-8765-0fedcba98765';

export const MERCHANT: AuthenticatedMerchant = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Demo Merchant',
  email: 'demo@payflow.local',
  document: '11222333000181',
  status: 'ACTIVE',
  webhookConfigured: true,
  webhook: { url: 'https://loja.example/hooks', events: ['payment.authorized'] },
};

export const SUMMARY: PaymentSummary = {
  currency: 'BRL',
  totalAmount: 125000,
  count: 42,
  byStatus: { AUTHORIZED: 30, PENDING: 5 },
  byMethod: { CARD: 90000, PIX: 35000 },
};

export const RECENT: RecentPayment[] = [
  { id: 'p1', amount: 1000, currency: 'BRL', method: 'CARD', status: 'AUTHORIZED', createdAt: '2026-10-26T10:00:00Z' },
  { id: 'p2', amount: 2000, currency: 'BRL', method: 'PIX', status: 'PENDING', createdAt: '2026-10-26T11:00:00Z' },
];

export const FEES: Fees = {
  totalFees: 3488,
  netAmount: 121512,
  byMethod: [
    { method: 'CARD', gross: 90000, rate: 0.0349, fee: 3141, settlement: 'D+30' },
    { method: 'PIX', gross: 35000, rate: 0.0099, fee: 347, settlement: 'D+0' },
  ],
};

export class FakeAuthenticator implements MerchantAuthenticator {
  failure: Error | undefined;
  readonly contexts: CallContext[] = [];

  async authenticate(merchantKey: string, context: CallContext): Promise<AuthenticatedMerchant | null> {
    this.contexts.push(context);
    if (this.failure !== undefined) {
      throw this.failure;
    }
    return merchantKey === MERCHANT_KEY ? MERCHANT : null;
  }
}

export interface RecordedCall {
  readonly method: string;
  readonly args: readonly unknown[];
}

// Records every proxied call and answers the configured reply (or failure).
export class Recorder {
  readonly calls: RecordedCall[] = [];
  reply: ServiceReply = { status: 200, body: { ok: true }, headers: { 'content-type': 'application/json' } };
  failure: Error | undefined;

  api<T extends object>(own: Partial<T> = {}): T {
    return new Proxy(own as T, {
      get: (target, property) => {
        const ownValue = (target as Record<string | symbol, unknown>)[property];
        if (ownValue !== undefined) {
          return ownValue;
        }
        return async (...args: unknown[]) => {
          this.calls.push({ method: String(property), args });
          if (this.failure !== undefined) {
            throw this.failure;
          }
          return this.reply;
        };
      },
    });
  }

  last(): RecordedCall {
    const call = this.calls.at(-1);
    if (call === undefined) {
      throw new Error('No call recorded');
    }
    return call;
  }
}

export class FakeFigures implements PaymentFigures {
  summaryResult: PaymentSummary | Error = SUMMARY;
  recentResult: RecentPayment[] | Error = RECENT;
  readonly started: string[] = [];

  async summary(): Promise<PaymentSummary> {
    this.started.push('summary');
    return settle(this.summaryResult);
  }

  async recent(): Promise<RecentPayment[]> {
    this.started.push('recent');
    return settle(this.recentResult);
  }
}

export class FakeFees implements FeeCalculator {
  result: Fees | Error = FEES;
  readonly received: Array<Readonly<Record<string, number>>> = [];

  async calculate(byMethod: Readonly<Record<string, number>>): Promise<Fees> {
    this.received.push(byMethod);
    return settle(this.result);
  }
}

export interface TestApp {
  readonly app: ReturnType<typeof createApp>;
  readonly authenticator: FakeAuthenticator;
  readonly merchants: Recorder;
  readonly payments: Recorder;
  readonly figures: FakeFigures;
  readonly fees: FakeFees;
}

export function testApp(settings: Partial<AppSettings> = {}, logger: Logger = pino({ level: 'silent' })): TestApp {
  const authenticator = new FakeAuthenticator();
  const merchants = new Recorder();
  const payments = new Recorder();
  const figures = new FakeFigures();
  const fees = new FakeFees();
  const dependencies: AppDependencies = {
    authenticator,
    merchants: merchants.api<MerchantsApi>(),
    payments: payments.api<PaymentsApi & PaymentFigures>({
      summary: figures.summary.bind(figures),
      recent: figures.recent.bind(figures),
    }),
    fees,
    logger,
    settings: { corsOrigins: [], ...settings },
    now: () => new Date('2026-10-26T15:00:00Z'),
  };
  return { app: createApp(dependencies), authenticator, merchants, payments, figures, fees };
}

async function settle<T>(value: T | Error): Promise<T> {
  if (value instanceof Error) {
    throw value;
  }
  return value;
}

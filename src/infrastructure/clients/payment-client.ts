import { z } from 'zod';

import type { CallContext, ServiceReply } from '../../domain/context.js';
import type { PaymentSummary, RecentPayment } from '../../domain/dashboard.js';
import type { PaymentFigures } from '../../features/aggregated-data/ports.js';
import type {
  NewPayment,
  PaymentChange,
  PaymentListQuery,
  PaymentsApi,
  RefundRequest,
} from '../../features/payments-proxy/ports.js';
import { toReply, type ServiceHttpClient } from './http.js';

const Summary = z.object({
  currency: z.string(),
  totalAmount: z.number(),
  count: z.number(),
  byStatus: z.record(z.string(), z.number()),
  byMethod: z.record(z.string(), z.number()),
});

const Page = z.object({
  items: z.array(z.object({
    id: z.string(),
    amount: z.number(),
    currency: z.string(),
    method: z.string(),
    status: z.string(),
    createdAt: z.string(),
  })),
});

export interface PaymentClientOptions {
  readonly internalKey: string;
  readonly panelTimeoutMs: number;
  readonly proxyTimeoutMs: number;
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

// payflow-payment-service: every call carries X-Internal-Key and the authenticated merchant in X-Merchant-Id.
export class PaymentClient implements PaymentFigures, PaymentsApi {
  constructor(
    private readonly http: ServiceHttpClient,
    private readonly options: PaymentClientOptions,
  ) {}

  async summary(merchantId: string, context: CallContext): Promise<PaymentSummary> {
    const result = await this.call('GET', '/v1/payments/summary', merchantId, context, this.options.panelTimeoutMs);
    return this.http.expect(result, Summary);
  }

  async recent(merchantId: string, limit: number, context: CallContext): Promise<RecentPayment[]> {
    const result = await this.call('GET', '/v1/payments', merchantId, context, this.options.panelTimeoutMs, {
      query: { page: 0, size: limit },
    });
    return this.http.expect(result, Page).items;
  }

  async create(merchantId: string, payment: NewPayment, idempotencyKey: string, context: CallContext): Promise<ServiceReply> {
    return toReply(await this.call('POST', '/v1/payments', merchantId, context, this.options.proxyTimeoutMs, {
      body: payment,
      headers: { 'idempotency-key': idempotencyKey },
    }));
  }

  async list(merchantId: string, query: PaymentListQuery, context: CallContext): Promise<ServiceReply> {
    return toReply(await this.call('GET', '/v1/payments', merchantId, context, this.options.proxyTimeoutMs, {
      query: { ...query },
    }));
  }

  async get(merchantId: string, paymentId: string, context: CallContext): Promise<ServiceReply> {
    return toReply(await this.call('GET', `/v1/payments/${paymentId}`, merchantId, context, this.options.proxyTimeoutMs));
  }

  async update(merchantId: string, paymentId: string, change: PaymentChange, context: CallContext): Promise<ServiceReply> {
    return toReply(await this.call('PATCH', `/v1/payments/${paymentId}`, merchantId, context, this.options.proxyTimeoutMs, {
      body: change,
    }));
  }

  async cancel(merchantId: string, paymentId: string, context: CallContext): Promise<ServiceReply> {
    return toReply(await this.call('DELETE', `/v1/payments/${paymentId}`, merchantId, context, this.options.proxyTimeoutMs));
  }

  async refund(
    merchantId: string,
    paymentId: string,
    refund: RefundRequest,
    idempotencyKey: string,
    context: CallContext,
  ): Promise<ServiceReply> {
    return toReply(await this.call('POST', `/v1/payments/${paymentId}/refunds`, merchantId, context,
      this.options.proxyTimeoutMs, { body: refund, headers: { 'idempotency-key': idempotencyKey } }));
  }

  async confirmPix(merchantId: string, paymentId: string, context: CallContext): Promise<ServiceReply> {
    return toReply(await this.call('POST', `/v1/payments/${paymentId}/pix-confirmation`, merchantId, context,
      this.options.proxyTimeoutMs));
  }

  private call(
    method: Method,
    path: string,
    merchantId: string,
    context: CallContext,
    timeoutMs: number,
    extra: {
      readonly body?: unknown;
      readonly query?: Record<string, string | number | undefined>;
      readonly headers?: Record<string, string>;
    } = {},
  ) {
    return this.http.call({
      method,
      path,
      context,
      timeoutMs,
      ...(extra.body === undefined ? {} : { body: extra.body }),
      ...(extra.query === undefined ? {} : { query: extra.query }),
      headers: { 'x-internal-key': this.options.internalKey, 'x-merchant-id': merchantId, ...extra.headers },
    });
  }
}

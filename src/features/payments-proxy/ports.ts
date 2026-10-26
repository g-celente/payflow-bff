import type { CallContext, ServiceReply } from '../../domain/context.js';

export interface NewPayment {
  readonly amount: number;
  readonly currency?: string | undefined;
  readonly method: 'CARD' | 'PIX';
  readonly cardToken?: string | undefined;
  readonly description?: string | undefined;
  readonly metadata?: Readonly<Record<string, string>> | undefined;
}

export interface PaymentChange {
  readonly description?: string | undefined;
  readonly metadata?: Readonly<Record<string, string>> | undefined;
}

export interface RefundRequest {
  readonly amount?: number | undefined;
  readonly reason?: string | undefined;
}

export type PaymentListQuery = Readonly<Partial<Record<'status' | 'method' | 'from' | 'to' | 'page' | 'size', string>>>;

// Implemented by the payment-service client. Every call carries the authenticated merchant's id.
export interface PaymentsApi {
  create(merchantId: string, payment: NewPayment, idempotencyKey: string, context: CallContext): Promise<ServiceReply>;
  list(merchantId: string, query: PaymentListQuery, context: CallContext): Promise<ServiceReply>;
  get(merchantId: string, paymentId: string, context: CallContext): Promise<ServiceReply>;
  update(merchantId: string, paymentId: string, change: PaymentChange, context: CallContext): Promise<ServiceReply>;
  cancel(merchantId: string, paymentId: string, context: CallContext): Promise<ServiceReply>;
  refund(
    merchantId: string,
    paymentId: string,
    refund: RefundRequest,
    idempotencyKey: string,
    context: CallContext,
  ): Promise<ServiceReply>;
  confirmPix(merchantId: string, paymentId: string, context: CallContext): Promise<ServiceReply>;
}

import { withBffLocation, type CallContext, type ServiceReply } from '../../domain/context.js';
import { InvalidRequestError } from '../../domain/errors.js';
import type { AuthenticatedMerchant } from '../../domain/merchant.js';
import type { NewPayment, PaymentChange, PaymentListQuery, PaymentsApi, RefundRequest } from './ports.js';

export const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

const forFrontend = (reply: ServiceReply) => withBffLocation(reply, '/v1/payments', '/payments');

// Moving money needs an Idempotency-Key from the frontend: a retry after a timeout must not charge twice.
export function requireIdempotencyKey(value: string | undefined): string {
  if (value === undefined || value.trim() === '' || value.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    throw new InvalidRequestError('Idempotency-Key header is required (1 to 255 characters)');
  }
  return value;
}

export async function createPayment(
  api: PaymentsApi,
  merchant: AuthenticatedMerchant,
  payment: NewPayment,
  idempotencyKey: string | undefined,
  context: CallContext,
): Promise<ServiceReply> {
  return api.create(merchant.id, payment, requireIdempotencyKey(idempotencyKey), context).then(forFrontend);
}

export function listPayments(
  api: PaymentsApi,
  merchant: AuthenticatedMerchant,
  query: PaymentListQuery,
  context: CallContext,
): Promise<ServiceReply> {
  return api.list(merchant.id, query, context).then(forFrontend);
}

export function getPayment(api: PaymentsApi, merchant: AuthenticatedMerchant, paymentId: string, context: CallContext) {
  return api.get(merchant.id, paymentId, context).then(forFrontend);
}

export function updatePayment(
  api: PaymentsApi,
  merchant: AuthenticatedMerchant,
  paymentId: string,
  change: PaymentChange,
  context: CallContext,
): Promise<ServiceReply> {
  return api.update(merchant.id, paymentId, change, context).then(forFrontend);
}

export function cancelPayment(api: PaymentsApi, merchant: AuthenticatedMerchant, paymentId: string, context: CallContext) {
  return api.cancel(merchant.id, paymentId, context).then(forFrontend);
}

export async function refundPayment(
  api: PaymentsApi,
  merchant: AuthenticatedMerchant,
  paymentId: string,
  refund: RefundRequest,
  idempotencyKey: string | undefined,
  context: CallContext,
): Promise<ServiceReply> {
  return api.refund(merchant.id, paymentId, refund, requireIdempotencyKey(idempotencyKey), context).then(forFrontend);
}

export function confirmPix(api: PaymentsApi, merchant: AuthenticatedMerchant, paymentId: string, context: CallContext) {
  return api.confirmPix(merchant.id, paymentId, context).then(forFrontend);
}

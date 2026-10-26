import type { CallContext } from './context.js';

export type MerchantStatus = 'ACTIVE' | 'SUSPENDED';

// The merchant behind the X-Merchant-Key, as the merchant-service answered GET /v1/merchants/me.
// Its id is the only merchant id the BFF ever sends downstream; the frontend never chooses it.
export interface AuthenticatedMerchant {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly document: string;
  readonly status: MerchantStatus;
  readonly webhookConfigured: boolean;
  readonly webhook: { readonly url: string; readonly events: readonly string[] } | null;
}

export interface MerchantAuthenticator {
  // null when the key is unknown, malformed or belongs to a suspended merchant.
  authenticate(merchantKey: string, context: CallContext): Promise<AuthenticatedMerchant | null>;
}

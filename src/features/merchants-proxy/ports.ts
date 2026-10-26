import type { CallContext, ServiceReply } from '../../domain/context.js';
import type { MerchantStatus } from '../../domain/merchant.js';

export interface NewMerchant {
  readonly name: string;
  readonly email: string;
  readonly document: string;
}

export interface MerchantProfile {
  readonly name: string;
  readonly email: string;
  readonly status: MerchantStatus;
}

export interface WebhookSettings {
  readonly url: string;
  readonly secret?: string | undefined;
  readonly events: readonly string[];
}

export interface MerchantListQuery {
  readonly status?: MerchantStatus | undefined;
  readonly page?: number | undefined;
  readonly size?: number | undefined;
}

// Implemented by the merchant-service client; answers are passed to the frontend as they come.
export interface MerchantsApi {
  create(merchant: NewMerchant, context: CallContext): Promise<ServiceReply>;
  list(query: MerchantListQuery, context: CallContext): Promise<ServiceReply>;
  get(merchantId: string, context: CallContext): Promise<ServiceReply>;
  update(merchantId: string, profile: MerchantProfile, context: CallContext): Promise<ServiceReply>;
  remove(merchantId: string, context: CallContext): Promise<ServiceReply>;
  configureWebhook(merchantId: string, settings: WebhookSettings, context: CallContext): Promise<ServiceReply>;
  rotateApiKey(merchantId: string, context: CallContext): Promise<ServiceReply>;
}

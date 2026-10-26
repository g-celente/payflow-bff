import { z } from 'zod';

import type { CallContext, ServiceReply } from '../../domain/context.js';
import type { AuthenticatedMerchant, MerchantAuthenticator } from '../../domain/merchant.js';
import type {
  MerchantListQuery,
  MerchantProfile,
  MerchantsApi,
  NewMerchant,
  WebhookSettings,
} from '../../features/merchants-proxy/ports.js';
import { toReply, type ServiceHttpClient } from './http.js';

const CurrentMerchant = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  document: z.string(),
  status: z.enum(['ACTIVE', 'SUSPENDED']),
  webhookConfigured: z.boolean(),
  webhook: z.object({ url: z.string(), events: z.array(z.string()) }).nullable(),
});

export interface MerchantClientOptions {
  readonly internalKey: string;
  readonly authTimeoutMs: number;
  readonly proxyTimeoutMs: number;
}

// payflow-merchant-service: /v1/merchants/me with the merchant's key, everything else with X-Internal-Key.
export class MerchantClient implements MerchantAuthenticator, MerchantsApi {
  constructor(
    private readonly http: ServiceHttpClient,
    private readonly options: MerchantClientOptions,
  ) {}

  async authenticate(merchantKey: string, context: CallContext): Promise<AuthenticatedMerchant | null> {
    const result = await this.http.call({
      method: 'GET',
      path: '/v1/merchants/me',
      headers: { 'x-merchant-key': merchantKey },
      timeoutMs: this.options.authTimeoutMs,
      context,
    });
    return result.status === 401 ? null : this.http.expect(result, CurrentMerchant);
  }

  create(merchant: NewMerchant, context: CallContext): Promise<ServiceReply> {
    return this.internal('POST', '/v1/merchants', context, { body: merchant });
  }

  list(query: MerchantListQuery, context: CallContext): Promise<ServiceReply> {
    return this.internal('GET', '/v1/merchants', context, { query: { ...query } });
  }

  get(merchantId: string, context: CallContext): Promise<ServiceReply> {
    return this.internal('GET', `/v1/merchants/${merchantId}`, context);
  }

  update(merchantId: string, profile: MerchantProfile, context: CallContext): Promise<ServiceReply> {
    return this.internal('PUT', `/v1/merchants/${merchantId}`, context, { body: profile });
  }

  remove(merchantId: string, context: CallContext): Promise<ServiceReply> {
    return this.internal('DELETE', `/v1/merchants/${merchantId}`, context);
  }

  configureWebhook(merchantId: string, settings: WebhookSettings, context: CallContext): Promise<ServiceReply> {
    return this.internal('PUT', `/v1/merchants/${merchantId}/webhook`, context, { body: settings });
  }

  rotateApiKey(merchantId: string, context: CallContext): Promise<ServiceReply> {
    return this.internal('POST', `/v1/merchants/${merchantId}/api-key`, context);
  }

  private async internal(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    context: CallContext,
    extra: { readonly body?: unknown; readonly query?: Record<string, string | number | undefined> } = {},
  ): Promise<ServiceReply> {
    return toReply(await this.http.call({
      method,
      path,
      context,
      timeoutMs: this.options.proxyTimeoutMs,
      headers: { 'x-internal-key': this.options.internalKey },
      ...extra,
    }));
  }
}

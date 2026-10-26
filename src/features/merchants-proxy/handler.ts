import { withBffLocation, type CallContext, type ServiceReply } from '../../domain/context.js';
import type { AuthenticatedMerchant } from '../../domain/merchant.js';
import type { MerchantListQuery, MerchantProfile, MerchantsApi, NewMerchant, WebhookSettings } from './ports.js';

const forFrontend = (reply: ServiceReply) => withBffLocation(reply, '/v1/merchants', '/merchants');

// --- the authenticated merchant's own account (/merchants/me) -----------------------------------------------

// The merchant edits name and e-mail; the status stays whatever it is (only an admin changes it).
export function updateOwnProfile(
  api: MerchantsApi,
  merchant: AuthenticatedMerchant,
  change: { readonly name: string; readonly email: string },
  context: CallContext,
): Promise<ServiceReply> {
  return api.update(merchant.id, { ...change, status: merchant.status }, context).then(forFrontend);
}

export function configureOwnWebhook(
  api: MerchantsApi,
  merchant: AuthenticatedMerchant,
  settings: WebhookSettings,
  context: CallContext,
): Promise<ServiceReply> {
  return api.configureWebhook(merchant.id, settings, context).then(forFrontend);
}

export function rotateOwnApiKey(api: MerchantsApi, merchant: AuthenticatedMerchant, context: CallContext): Promise<ServiceReply> {
  return api.rotateApiKey(merchant.id, context).then(forFrontend);
}

// --- sign-up (public) and administration (X-Admin-Key) ---------------------------------------------------

export function signUp(api: MerchantsApi, merchant: NewMerchant, context: CallContext): Promise<ServiceReply> {
  return api.create(merchant, context).then(forFrontend);
}

export function listMerchants(api: MerchantsApi, query: MerchantListQuery, context: CallContext): Promise<ServiceReply> {
  return api.list(query, context).then(forFrontend);
}

export function getMerchant(api: MerchantsApi, merchantId: string, context: CallContext): Promise<ServiceReply> {
  return api.get(merchantId, context).then(forFrontend);
}

export function updateMerchant(
  api: MerchantsApi,
  merchantId: string,
  profile: MerchantProfile,
  context: CallContext,
): Promise<ServiceReply> {
  return api.update(merchantId, profile, context).then(forFrontend);
}

export function removeMerchant(api: MerchantsApi, merchantId: string, context: CallContext): Promise<ServiceReply> {
  return api.remove(merchantId, context).then(forFrontend);
}

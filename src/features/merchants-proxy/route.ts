import { Router, type RequestHandler } from 'express';
import { z } from 'zod';

import { sendReply } from '../../api/reply.js';
import { callContext, currentMerchant } from '../../api/request-context.js';
import { parseInput, uuidParam } from '../../api/validation.js';
import * as merchants from './handler.js';
import type { MerchantsApi } from './ports.js';

// Shapes only; the merchant-service validates the business rules and answers with Problem Details.
const Status = z.enum(['ACTIVE', 'SUSPENDED']);
const Profile = z.object({ name: z.string(), email: z.string() });
const AdminProfile = Profile.extend({ status: Status });
const Webhook = z.object({ url: z.string(), secret: z.string().optional(), events: z.array(z.string()) });
const NewMerchant = z.object({ name: z.string(), email: z.string(), document: z.string() });
const ListQuery = z.object({
  status: Status.optional(),
  page: z.coerce.number().int().min(0).optional(),
  size: z.coerce.number().int().min(1).max(100).optional(),
});

export interface MerchantGuards {
  readonly requireMerchant: RequestHandler;
  readonly requireAdmin: RequestHandler;
}

export function merchantsRoutes(api: MerchantsApi, guards: MerchantGuards): Router {
  const router = Router();
  const { requireMerchant, requireAdmin } = guards;

  // The merchant's own account. Registered before /merchants/:id.
  router.get('/merchants/me', requireMerchant, (_request, response) => {
    response.json(currentMerchant(response));
  });
  router.put('/merchants/me', requireMerchant, async (request, response) => {
    const change = parseInput(Profile, request.body);
    sendReply(response, await merchants.updateOwnProfile(api, currentMerchant(response), change, callContext(response)));
  });
  router.put('/merchants/me/webhook', requireMerchant, async (request, response) => {
    const settings = parseInput(Webhook, request.body);
    sendReply(response, await merchants.configureOwnWebhook(api, currentMerchant(response), settings, callContext(response)));
  });
  router.post('/merchants/me/api-key', requireMerchant, async (_request, response) => {
    sendReply(response, await merchants.rotateOwnApiKey(api, currentMerchant(response), callContext(response)));
  });

  // Sign-up: public, answers the API key once.
  router.post('/merchants', async (request, response) => {
    sendReply(response, await merchants.signUp(api, parseInput(NewMerchant, request.body), callContext(response)));
  });

  // Administration.
  router.get('/merchants', requireAdmin, async (request, response) => {
    sendReply(response, await merchants.listMerchants(api, parseInput(ListQuery, request.query), callContext(response)));
  });
  router.get('/merchants/:id', requireAdmin, async (request, response) => {
    sendReply(response, await merchants.getMerchant(api, uuidParam(request.params.id), callContext(response)));
  });
  router.put('/merchants/:id', requireAdmin, async (request, response) => {
    const profile = parseInput(AdminProfile, request.body);
    sendReply(response, await merchants.updateMerchant(api, uuidParam(request.params.id), profile, callContext(response)));
  });
  router.delete('/merchants/:id', requireAdmin, async (request, response) => {
    sendReply(response, await merchants.removeMerchant(api, uuidParam(request.params.id), callContext(response)));
  });

  return router;
}

import { Router, type RequestHandler } from 'express';
import { z } from 'zod';

import { sendReply } from '../../api/reply.js';
import { callContext, currentMerchant } from '../../api/request-context.js';
import { parseInput, uuidParam } from '../../api/validation.js';
import * as payments from './handler.js';
import type { PaymentsApi } from './ports.js';

// Shapes only; the payment-service validates amounts, tokens and transitions.
const Metadata = z.record(z.string(), z.string());
const NewPayment = z.object({
  amount: z.number().int(),
  currency: z.string().optional(),
  method: z.enum(['CARD', 'PIX']),
  cardToken: z.string().optional(),
  description: z.string().optional(),
  metadata: Metadata.optional(),
});
const PaymentChange = z.object({ description: z.string().optional(), metadata: Metadata.optional() });
const Refund = z.object({ amount: z.number().int().optional(), reason: z.string().optional() }).default({});
const ListQuery = z.object({
  status: z.string().optional(),
  method: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.string().optional(),
  size: z.string().optional(),
});

const IDEMPOTENCY_KEY = 'idempotency-key';

export function paymentsRoutes(api: PaymentsApi, requireMerchant: RequestHandler): Router {
  const router = Router();
  router.use('/payments', requireMerchant);

  router.post('/payments', async (request, response) => {
    const payment = parseInput(NewPayment, request.body);
    sendReply(response, await payments.createPayment(api, currentMerchant(response), payment,
      request.get(IDEMPOTENCY_KEY), callContext(response)));
  });
  router.get('/payments', async (request, response) => {
    const query = parseInput(ListQuery, request.query);
    sendReply(response, await payments.listPayments(api, currentMerchant(response), query, callContext(response)));
  });
  router.get('/payments/:id', async (request, response) => {
    sendReply(response, await payments.getPayment(api, currentMerchant(response), uuidParam(request.params.id),
      callContext(response)));
  });
  router.patch('/payments/:id', async (request, response) => {
    const change = parseInput(PaymentChange, request.body);
    sendReply(response, await payments.updatePayment(api, currentMerchant(response), uuidParam(request.params.id),
      change, callContext(response)));
  });
  router.delete('/payments/:id', async (request, response) => {
    sendReply(response, await payments.cancelPayment(api, currentMerchant(response), uuidParam(request.params.id),
      callContext(response)));
  });
  router.post('/payments/:id/refunds', async (request, response) => {
    const refund = parseInput(Refund, request.body);
    sendReply(response, await payments.refundPayment(api, currentMerchant(response), uuidParam(request.params.id),
      refund, request.get(IDEMPOTENCY_KEY), callContext(response)));
  });
  router.post('/payments/:id/pix-confirmation', async (request, response) => {
    sendReply(response, await payments.confirmPix(api, currentMerchant(response), uuidParam(request.params.id),
      callContext(response)));
  });

  return router;
}

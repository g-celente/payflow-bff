import type { ServerResponse } from 'node:http';

import cors from 'cors';
import express, { type Express, type Response } from 'express';
import type { Logger } from 'pino';
import { pinoHttp } from 'pino-http';

import type { MerchantAuthenticator } from '../domain/merchant.js';
import type { FeeCalculator, PaymentFigures } from '../features/aggregated-data/ports.js';
import { aggregatedDataRoutes } from '../features/aggregated-data/route.js';
import type { MerchantsApi } from '../features/merchants-proxy/ports.js';
import { merchantsRoutes } from '../features/merchants-proxy/route.js';
import type { PaymentsApi } from '../features/payments-proxy/ports.js';
import { paymentsRoutes } from '../features/payments-proxy/route.js';
import { docsRoutes, loadOpenApi } from './docs.js';
import { requireAdmin, requireMerchant } from './middlewares/auth.js';
import { correlationId } from './middlewares/correlation-id.js';
import { errorHandler, notFound } from './middlewares/errors.js';
import { requireGatewaySecret } from './middlewares/gateway-secret.js';

// Header values that must never reach the logs.
export const LOG_REDACTIONS = [
  'req.headers["x-merchant-key"]',
  'req.headers["x-admin-key"]',
  'req.headers["x-gateway-secret"]',
  'req.headers["x-api-key"]',
  'req.headers.authorization',
];

export interface AppSettings {
  readonly gatewaySecret?: string | undefined;
  readonly adminKey?: string | undefined;
  readonly corsOrigins: readonly string[];
}

// Ports implemented by the infrastructure clients; server.ts (or a test) chooses the implementations.
export interface AppDependencies {
  readonly authenticator: MerchantAuthenticator;
  readonly merchants: MerchantsApi;
  readonly payments: PaymentsApi & PaymentFigures;
  readonly fees: FeeCalculator;
  readonly logger: Logger;
  readonly settings: AppSettings;
  readonly now?: () => Date;
  readonly openApi?: Record<string, unknown>;
}

export function createApp(dependencies: AppDependencies): Express {
  const { logger, settings } = dependencies;
  const app = express();
  app.disable('x-powered-by');

  app.use(correlationId());
  app.use(pinoHttp({
    logger,
    genReqId: (_request, response: ServerResponse) => (response as Response).locals.correlationId,
    customLogLevel: (_request, response, error) =>
      error || response.statusCode >= 500 ? 'error' : response.statusCode >= 400 ? 'warn' : 'info',
  }));
  if (settings.corsOrigins.length > 0) {
    app.use(cors({
      origin: [...settings.corsOrigins],
      allowedHeaders: ['Content-Type', 'X-Merchant-Key', 'X-Admin-Key', 'Idempotency-Key', 'X-Correlation-Id', 'x-api-key'],
      exposedHeaders: ['Location', 'Idempotent-Replayed', 'Retry-After', 'X-Correlation-Id'],
    }));
  }

  // Liveness for Container Apps; answered before the gateway check.
  app.get('/health', (_request, response) => {
    response.json({ status: 'UP' });
  });

  app.use(requireGatewaySecret(settings.gatewaySecret));
  app.use(express.json({ limit: '64kb' }));
  app.use(docsRoutes(dependencies.openApi ?? loadOpenApi()));

  const merchantGuard = requireMerchant(dependencies.authenticator);
  app.use(aggregatedDataRoutes(
    { payments: dependencies.payments, fees: dependencies.fees, now: dependencies.now ?? (() => new Date()) },
    merchantGuard,
  ));
  app.use(merchantsRoutes(dependencies.merchants, {
    requireMerchant: merchantGuard,
    requireAdmin: requireAdmin(settings.adminKey),
  }));
  app.use(paymentsRoutes(dependencies.payments, merchantGuard));

  app.use(notFound());
  app.use(errorHandler(logger));
  return app;
}

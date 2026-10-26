import { existsSync } from 'node:fs';

import { pino } from 'pino';

import { createApp, LOG_REDACTIONS } from './api/app.js';
import { FeesClient } from './infrastructure/clients/fees-client.js';
import { ServiceHttpClient } from './infrastructure/clients/http.js';
import { MerchantClient } from './infrastructure/clients/merchant-client.js';
import { PaymentClient } from './infrastructure/clients/payment-client.js';
import { loadConfig } from './infrastructure/config.js';

// Composition root: reads the environment, builds the clients and hands them to the app as ports.
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
const config = loadConfig();

const logger = pino({
  level: config.logLevel,
  redact: { paths: LOG_REDACTIONS, censor: '****' },
  ...(process.env.NODE_ENV !== 'production' && process.stdout.isTTY
    ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
    : {}),
});

const merchants = new MerchantClient(new ServiceHttpClient('merchant-service', config.merchantServiceUrl), {
  internalKey: config.internalKey,
  authTimeoutMs: config.upstreamTimeoutMs,
  proxyTimeoutMs: config.proxyTimeoutMs,
});
const payments = new PaymentClient(new ServiceHttpClient('payment-service', config.paymentServiceUrl), {
  internalKey: config.internalKey,
  panelTimeoutMs: config.upstreamTimeoutMs,
  proxyTimeoutMs: config.proxyTimeoutMs,
});
const fees = new FeesClient(
  config.feesFunctionUrl === undefined ? null : new ServiceHttpClient('calculate-fees', config.feesFunctionUrl),
  config.feesFunctionKey,
  config.upstreamTimeoutMs,
);

const app = createApp({
  authenticator: merchants,
  merchants,
  payments,
  fees,
  logger,
  settings: { gatewaySecret: config.gatewaySecret, adminKey: config.adminKey, corsOrigins: config.corsOrigins },
});

if (config.gatewaySecret === undefined) {
  logger.warn('GATEWAY_ORIGIN_SECRET is not set: requests are accepted without the API Gateway header');
}
if (config.feesFunctionUrl === undefined) {
  logger.warn('FEES_FUNCTION_URL is not set: /aggregated-data answers fees null with a warning');
}

const server = app.listen(config.port, () => {
  logger.info({ port: config.port }, 'payflow-bff listening');
});

// Container Apps sends SIGTERM before replacing a revision: finish the requests in flight, then exit.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    logger.info({ signal }, 'Shutting down');
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}

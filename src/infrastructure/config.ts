import { z } from 'zod';

// Empty variables count as unset (docker compose and .env files often leave them empty).
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  MERCHANT_SERVICE_URL: z.url(),
  PAYMENT_SERVICE_URL: z.url(),
  FEES_FUNCTION_URL: optional(z.url()),
  FEES_FUNCTION_KEY: optional(z.string()),
  INTERNAL_KEY: z.string().min(32).max(256),
  GATEWAY_ORIGIN_SECRET: optional(z.string().min(16)),
  ADMIN_KEY: optional(z.string().min(32).max(256)),
  CORS_ORIGIN: optional(z.string()),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(2000),
  PROXY_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(10_000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export interface Config {
  readonly port: number;
  readonly merchantServiceUrl: string;
  readonly paymentServiceUrl: string;
  readonly feesFunctionUrl: string | undefined;
  readonly feesFunctionKey: string | undefined;
  readonly internalKey: string;
  readonly gatewaySecret: string | undefined;
  readonly adminKey: string | undefined;
  readonly corsOrigins: readonly string[];
  // Panel calls and the merchant authentication: short, a slow part becomes a warning.
  readonly upstreamTimeoutMs: number;
  // Proxied CRUD calls: longer, so the services' own answers (e.g. a gateway 504) reach the frontend.
  readonly proxyTimeoutMs: number;
  readonly logLevel: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

// Names the invalid variables without ever printing their values (some are secrets).
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = EnvSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new ConfigError(`Invalid environment: ${problems.join('; ')}`);
  }
  const value = result.data;
  return {
    port: value.PORT,
    merchantServiceUrl: value.MERCHANT_SERVICE_URL,
    paymentServiceUrl: value.PAYMENT_SERVICE_URL,
    feesFunctionUrl: value.FEES_FUNCTION_URL,
    feesFunctionKey: value.FEES_FUNCTION_KEY,
    internalKey: value.INTERNAL_KEY,
    gatewaySecret: value.GATEWAY_ORIGIN_SECRET,
    adminKey: value.ADMIN_KEY,
    corsOrigins: (value.CORS_ORIGIN ?? '').split(',').map((origin) => origin.trim()).filter(Boolean),
    upstreamTimeoutMs: value.UPSTREAM_TIMEOUT_MS,
    proxyTimeoutMs: value.PROXY_TIMEOUT_MS,
    logLevel: value.LOG_LEVEL,
  };
}

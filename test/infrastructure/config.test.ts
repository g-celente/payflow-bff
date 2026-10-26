import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from '../../src/infrastructure/config.js';

const VALID = {
  MERCHANT_SERVICE_URL: 'http://localhost:8081',
  PAYMENT_SERVICE_URL: 'http://localhost:8082',
  INTERNAL_KEY: 'internal-key-0123456789abcdef0123456789',
};

describe('loadConfig', () => {
  it('applies the defaults', () => {
    const config = loadConfig(VALID);
    expect(config).toMatchObject({
      port: 3000,
      upstreamTimeoutMs: 2000,
      proxyTimeoutMs: 10000,
      feesFunctionUrl: undefined,
      gatewaySecret: undefined,
      adminKey: undefined,
      corsOrigins: [],
    });
  });

  it('treats empty variables as unset and splits the CORS origins', () => {
    const config = loadConfig({
      ...VALID, FEES_FUNCTION_URL: '', GATEWAY_ORIGIN_SECRET: '', CORS_ORIGIN: 'http://localhost:5173, https://d123.cloudfront.net',
    });
    expect(config.feesFunctionUrl).toBeUndefined();
    expect(config.gatewaySecret).toBeUndefined();
    expect(config.corsOrigins).toEqual(['http://localhost:5173', 'https://d123.cloudfront.net']);
  });

  it('names what is wrong without printing secret values', () => {
    const secret = 'short-secret';
    try {
      loadConfig({ ...VALID, INTERNAL_KEY: secret, PAYMENT_SERVICE_URL: 'not a url', MERCHANT_SERVICE_URL: undefined });
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigError);
      const message = (error as Error).message;
      expect(message).toContain('INTERNAL_KEY');
      expect(message).toContain('PAYMENT_SERVICE_URL');
      expect(message).toContain('MERCHANT_SERVICE_URL');
      expect(message).not.toContain(secret);
    }
  });
});

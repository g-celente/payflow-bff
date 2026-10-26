import { z } from 'zod';

import type { CallContext } from '../../domain/context.js';
import type { Fees } from '../../domain/dashboard.js';
import { DependencyUnavailableError } from '../../domain/errors.js';
import type { FeeCalculator } from '../../features/aggregated-data/ports.js';
import type { ServiceHttpClient } from './http.js';

const FeesAnswer = z.object({
  totalFees: z.number(),
  netAmount: z.number(),
  byMethod: z.array(z.object({
    method: z.string(),
    gross: z.number(),
    rate: z.number(),
    fee: z.number(),
    settlement: z.string(),
  })),
});

// Azure Function calculate-fees (HTTP Trigger, authLevel function): POST { byMethod, currency }.
// Without FEES_FUNCTION_URL the panel still answers, with fees null and a warning.
export class FeesClient implements FeeCalculator {
  constructor(
    private readonly http: ServiceHttpClient | null,
    private readonly functionKey: string | undefined,
    private readonly timeoutMs: number,
  ) {}

  async calculate(byMethod: Readonly<Record<string, number>>, currency: string, context: CallContext): Promise<Fees> {
    if (this.http === null) {
      throw new DependencyUnavailableError('calculate-fees', 'not-configured', 'calculate-fees is not configured (FEES_FUNCTION_URL)');
    }
    const result = await this.http.call({
      method: 'POST',
      path: '',
      body: { byMethod, currency },
      headers: this.functionKey === undefined ? {} : { 'x-functions-key': this.functionKey },
      timeoutMs: this.timeoutMs,
      context,
    });
    return this.http.expect(result, FeesAnswer);
  }
}

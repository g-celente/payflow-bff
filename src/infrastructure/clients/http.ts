import type { z } from 'zod';

import type { CallContext, ServiceReply } from '../../domain/context.js';
import { DependencyUnavailableError } from '../../domain/errors.js';

export interface HttpCall {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly context: CallContext;
  readonly timeoutMs: number;
  readonly query?: Readonly<Record<string, string | number | undefined>>;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
}

export interface HttpResult {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Headers;
}

// Headers from a service answer that the frontend needs.
const FORWARDED_HEADERS = ['content-type', 'location', 'retry-after', 'idempotent-replayed'];

// fetch with a timeout per call (AbortSignal.timeout) and the X-Correlation-Id of the incoming request.
// No answer becomes DependencyUnavailableError; any HTTP answer, even 4xx/5xx, is returned as is.
export class ServiceHttpClient {
  constructor(
    readonly name: string,
    private readonly baseUrl: string,
    private readonly defaultHeaders: Readonly<Record<string, string>> = {},
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async call(call: HttpCall): Promise<HttpResult> {
    const url = new URL(call.path, this.baseUrl);
    for (const [name, value] of Object.entries(call.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(name, String(value));
      }
    }
    const headers: Record<string, string> = {
      accept: 'application/json',
      'x-correlation-id': call.context.correlationId,
      ...this.defaultHeaders,
      ...call.headers,
    };
    if (call.body !== undefined) {
      headers['content-type'] = 'application/json';
    }
    const signal = AbortSignal.timeout(call.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method: call.method,
        headers,
        body: call.body === undefined ? null : JSON.stringify(call.body),
        signal,
      });
      const text = await response.text();
      return { status: response.status, body: parseBody(text), headers: response.headers };
    } catch (failure) {
      if (signal.aborted) {
        throw new DependencyUnavailableError(this.name, 'timeout', `${this.name} did not answer in ${call.timeoutMs} ms`);
      }
      throw new DependencyUnavailableError(this.name, 'unreachable',
        `${this.name} is unreachable (${(failure as Error).message})`);
    }
  }

  // A 2xx body read into a typed value; anything else is the dependency misbehaving.
  expect<T extends z.ZodType>(result: HttpResult, schema: T, expectedStatus = 200): z.output<T> {
    if (result.status !== expectedStatus) {
      throw new DependencyUnavailableError(this.name, 'bad-response', `${this.name} answered HTTP ${result.status}`);
    }
    const parsed = schema.safeParse(result.body);
    if (!parsed.success) {
      throw new DependencyUnavailableError(this.name, 'bad-response', `${this.name} answered an unexpected body`);
    }
    return parsed.data;
  }
}

export function toReply(result: HttpResult): ServiceReply {
  const headers: Record<string, string> = {};
  for (const name of FORWARDED_HEADERS) {
    const value = result.headers.get(name);
    if (value !== null) {
      headers[name] = value;
    }
  }
  return { status: result.status, body: result.body, headers };
}

function parseBody(text: string): unknown {
  if (text === '') {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

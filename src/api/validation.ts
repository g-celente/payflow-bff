import type { z } from 'zod';

import { InvalidRequestError } from '../domain/errors.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Checks the shape of a body or query string; the 400 lists every field that is wrong.
export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => {
      const field = issue.path.length === 0 ? 'body' : issue.path.join('.');
      return `${field}: ${issue.message}`;
    });
    throw new InvalidRequestError(`Invalid request: ${problems.join('; ')}`);
  }
  return result.data;
}

export function uuidParam(value: string | string[] | undefined): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new InvalidRequestError('The id in the path must be a UUID');
  }
  return value;
}

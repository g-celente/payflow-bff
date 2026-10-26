import type { Response } from 'express';

// Errors the BFF answers itself, as RFC 9457 Problem Details (the same format as the Java services).
export function sendProblem(
  response: Response,
  status: number,
  title: string,
  detail: string,
  extra: Readonly<Record<string, unknown>> = {},
): void {
  response
    .status(status)
    .type('application/problem+json')
    .send(JSON.stringify({ type: 'about:blank', title, status, detail, ...extra }));
}

import { randomUUID } from 'node:crypto';

import type { RequestHandler } from 'express';

const ACCEPTED = /^[A-Za-z0-9._-]{1,100}$/;

// Keeps the caller's X-Correlation-Id (or creates one), returns it and passes it to every service call.
export function correlationId(): RequestHandler {
  return (request, response, next) => {
    const received = request.get('x-correlation-id');
    const id = received !== undefined && ACCEPTED.test(received) ? received : randomUUID();
    response.locals.correlationId = id;
    response.setHeader('X-Correlation-Id', id);
    next();
  };
}

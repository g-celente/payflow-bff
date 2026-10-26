import type { Response } from 'express';

import type { ServiceReply } from '../domain/context.js';

// Answers the frontend with what the service answered: same status, body and the headers it needs.
export function sendReply(response: Response, reply: ServiceReply): void {
  response.status(reply.status);
  for (const [name, value] of Object.entries(reply.headers)) {
    response.setHeader(name, value);
  }
  if (reply.body === null || reply.body === undefined || reply.status === 204) {
    response.end();
    return;
  }
  if (typeof reply.body === 'string') {
    response.send(reply.body);
    return;
  }
  // Keeps application/problem+json when the service sent it.
  response.send(JSON.stringify(reply.body));
}

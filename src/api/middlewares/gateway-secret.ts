import type { RequestHandler } from 'express';

import { sendProblem } from '../problem.js';
import { sameSecret } from '../secrets.js';

// The API Gateway adds X-Gateway-Secret to every request it forwards; anything else is refused, so the
// Container Apps URL cannot be used to skip the gateway's API key and throttling.
// Without GATEWAY_ORIGIN_SECRET (local development) the check is off.
export function requireGatewaySecret(secret: string | undefined): RequestHandler {
  return (request, response, next) => {
    if (secret === undefined || sameSecret(request.get('x-gateway-secret'), secret)) {
      next();
      return;
    }
    sendProblem(response, 403, 'Forbidden', 'Requests must come through the API Gateway');
  };
}

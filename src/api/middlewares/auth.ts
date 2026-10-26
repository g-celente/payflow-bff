import type { RequestHandler, Response } from 'express';

import type { MerchantAuthenticator } from '../../domain/merchant.js';
import { sendProblem } from '../problem.js';
import { callContext } from '../request-context.js';
import { sameSecret } from '../secrets.js';

// X-Merchant-Key is checked by the merchant-service on every request; the merchant it answers is the only
// merchant id the BFF sends downstream. A merchant-service failure answers 502/504 (error handler), not 401.
export function requireMerchant(authenticator: MerchantAuthenticator): RequestHandler {
  return async (request, response, next) => {
    const key = request.get('x-merchant-key');
    const merchant = key ? await authenticator.authenticate(key, callContext(response)) : null;
    if (merchant === null) {
      unauthorized(response, 'X-Merchant-Key', 'Missing or invalid merchant key');
      return;
    }
    response.locals.merchant = merchant;
    next();
  };
}

// Merchant administration (list, read, change, delete any merchant). Off when ADMIN_KEY is not set.
export function requireAdmin(adminKey: string | undefined): RequestHandler {
  return (request, response, next) => {
    if (adminKey === undefined) {
      sendProblem(response, 404, 'Not Found', 'Merchant administration is disabled (ADMIN_KEY is not set)');
      return;
    }
    if (!sameSecret(request.get('x-admin-key'), adminKey)) {
      unauthorized(response, 'X-Admin-Key', 'Missing or invalid admin key');
      return;
    }
    next();
  };
}

function unauthorized(response: Response, header: string, detail: string): void {
  response.setHeader('WWW-Authenticate', `ApiKey header="${header}"`);
  sendProblem(response, 401, 'Unauthorized', detail);
}

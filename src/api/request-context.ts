import type { Response } from 'express';

import type { CallContext } from '../domain/context.js';
import type { AuthenticatedMerchant } from '../domain/merchant.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      correlationId: string;
      merchant?: AuthenticatedMerchant;
    }
  }
}

// Set by the merchant-auth middleware; routes behind it can rely on it.
export function currentMerchant(response: Response): AuthenticatedMerchant {
  const merchant = response.locals.merchant;
  if (merchant === undefined) {
    throw new Error('Route needs the merchant-auth middleware');
  }
  return merchant;
}

export function callContext(response: Response): CallContext {
  return { correlationId: response.locals.correlationId };
}

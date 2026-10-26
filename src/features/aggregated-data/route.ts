import { Router, type RequestHandler } from 'express';

import { callContext, currentMerchant } from '../../api/request-context.js';
import { getAggregatedData } from './handler.js';
import type { AggregatedDataPorts } from './ports.js';

export function aggregatedDataRoutes(ports: AggregatedDataPorts, requireMerchant: RequestHandler): Router {
  const router = Router();

  router.get('/aggregated-data', requireMerchant, async (_request, response) => {
    response.json(await getAggregatedData(currentMerchant(response), ports, callContext(response)));
  });

  return router;
}

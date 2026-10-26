import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { parse } from 'yaml';

export function loadOpenApi(): Record<string, unknown> {
  const file = fileURLToPath(new URL('./openapi.yaml', import.meta.url));
  return parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
}

// Swagger UI at /docs/. Every link is relative, so it also works behind the API Gateway at /api/docs/.
export function docsRoutes(document: Record<string, unknown>): Router {
  const router = Router();
  const options = { customSiteTitle: 'PayFlow BFF', swaggerOptions: { url: 'openapi.json', persistAuthorization: true } };

  router.get('/docs/openapi.json', (_request, response) => {
    response.json(document);
  });
  router.get('/docs', (request, response, next) => {
    // Express matches /docs and /docs/; only the first needs the slash to resolve relative assets.
    if (request.originalUrl.split('?')[0]?.endsWith('/')) {
      next();
      return;
    }
    response.redirect(301, 'docs/');
  });
  router.use('/docs', swaggerUi.serveFiles(undefined, options), swaggerUi.setup(undefined, options));

  return router;
}

import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';

import { DependencyUnavailableError, InvalidRequestError } from '../../domain/errors.js';
import { sendProblem } from '../problem.js';

export function notFound(): RequestHandler {
  return (request, response) => {
    sendProblem(response, 404, 'Not Found', `No route for ${request.method} ${request.path}`);
  };
}

interface BodyParserError {
  readonly type?: string;
}

export function errorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    if (error instanceof InvalidRequestError) {
      sendProblem(response, 400, 'Bad Request', error.message);
      return;
    }
    if (error instanceof DependencyUnavailableError) {
      logger.warn({ dependency: error.dependency, reason: error.reason }, error.message);
      const status = error.reason === 'timeout' ? 504 : 502;
      sendProblem(response, status, status === 504 ? 'Gateway Timeout' : 'Bad Gateway', error.message, {
        dependency: error.dependency,
      });
      return;
    }
    const bodyError = (error as BodyParserError | null)?.type;
    if (bodyError === 'entity.parse.failed') {
      sendProblem(response, 400, 'Bad Request', 'The body is not valid JSON');
      return;
    }
    if (bodyError === 'entity.too.large') {
      sendProblem(response, 413, 'Content Too Large', 'The body is limited to 64 KB');
      return;
    }
    logger.error({ err: error }, 'Unexpected error');
    sendProblem(response, 500, 'Internal Server Error', 'Unexpected error; see the logs with this X-Correlation-Id');
  };
}

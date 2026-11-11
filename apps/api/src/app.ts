import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError } from 'fastify';
import type { ApiError } from '@provecheck/shared';
import type { Env } from './lib/env.js';
import { healthRoutes } from './modules/health/routes.js';

export async function buildApp(env: Env) {
  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(helmet);
  await app.register(cors, { origin: env.CORS_ORIGINS });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  // Errors never leak internals; clients map `code` to an i18n key.
  app.setErrorHandler((err: FastifyError, req, reply) => {
    const isValidation = err.validation !== undefined;
    const status = err.statusCode ?? 500;
    if (status >= 500) req.log.error({ err }, 'unhandled error');
    const body: ApiError = {
      code: isValidation
        ? 'validation_failed'
        : status === 404
          ? 'not_found'
          : status >= 500
            ? 'internal'
            : 'forbidden',
      requestId: req.id,
    };
    return reply.status(status).send(body);
  });

  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send({ code: 'not_found', requestId: req.id } satisfies ApiError),
  );

  await app.register(healthRoutes);
  return app;
}

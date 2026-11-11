import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError } from 'fastify';
import { ZodError } from 'zod';
import type { ApiError } from '@provecheck/shared';
import { AppError } from './lib/errors.js';
import type { Env } from './lib/env.js';
import { authRoutes } from './modules/auth/routes.js';
import { createAuthService } from './modules/auth/service.js';
import { healthRoutes } from './modules/health/routes.js';
import { authGuard } from './plugins/auth-guard.js';
import { createUsersService } from './modules/users/service.js';
import { catalogsRoutes } from './modules/catalogs/routes.js';
import { createCatalogsService } from './modules/catalogs/service.js';
import { tasksRoutes } from './modules/tasks/routes.js';
import { createCollaboratorTasks } from './modules/tasks/collaborator.js';
import { createTasksService } from './modules/tasks/service.js';
import { usersRoutes } from './modules/users/routes.js';
import { createDb } from './plugins/db.js';
import { createSupabase } from './plugins/supabase.js';

export async function buildApp(env: Env) {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // Never log credentials or tokens.
      redact: [
        'req.headers.authorization',
        'req.body.password',
        'req.body.newPassword',
        'req.body.currentPassword',
      ],
    },
    genReqId: () => crypto.randomUUID(),
  });

  const db = createDb(env.DATABASE_URL);
  const supabase = createSupabase(env);
  app.addHook('onClose', async () => {
    await db.pool.end();
  });

  await app.register(helmet);
  await app.register(cors, {
    origin: env.CORS_ORIGINS,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });
  await app.register(rateLimit, { max: 300, timeWindow: '1 minute' });

  // Errors never leak internals; clients map `code` to an i18n key.
  app.setErrorHandler((err: FastifyError | AppError | ZodError, req, reply) => {
    let status: number;
    let body: ApiError;
    if (err instanceof AppError) {
      status = err.status;
      body = { code: err.code, details: err.details };
    } else if (err instanceof ZodError) {
      status = 422;
      body = {
        code: 'VALIDATION_ERROR',
        details: { issues: err.issues.map((i) => ({ path: i.path.join('.'), code: i.code })) },
      };
    } else if ((err as FastifyError).statusCode === 429) {
      status = 429;
      body = { code: 'RATE_LIMITED' };
    } else if ((err as FastifyError).statusCode && (err as FastifyError).statusCode! < 500) {
      status = (err as FastifyError).statusCode!;
      body = { code: status === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR' };
    } else {
      req.log.error({ err }, 'unhandled error');
      status = 500;
      body = { code: 'INTERNAL' };
    }
    return reply.status(status).send({ ...body, requestId: req.id } satisfies ApiError);
  });

  app.setNotFoundHandler((req, reply) =>
    reply.status(404).send({ code: 'NOT_FOUND', requestId: req.id } satisfies ApiError),
  );

  await app.register(healthRoutes);
  const auth = createAuthService({ db, supabase });
  await app.register(async (scope) => {
    authGuard(scope, auth);
    await scope.register(authRoutes, { auth, maxLoginAttempts: env.LOGIN_MAX_ATTEMPTS });
    await scope.register(usersRoutes, { users: createUsersService({ db, supabase }) });
    await scope.register(tasksRoutes, {
      tasks: createTasksService({ db }),
      collab: createCollaboratorTasks({ db }),
    });
    await scope.register(catalogsRoutes, { catalogs: createCatalogsService({ db }) });
  });
  return app;
}

export type App = Awaited<ReturnType<typeof buildApp>>;

import {
  changePasswordInput,
  firstLoginInput,
  loginInput,
  preferencesInput,
  refreshInput,
} from '@provecheck/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AttemptLimiter } from '../../lib/attempt-limiter.js';
import { AppError } from '../../lib/errors.js';
import type { AuthContext, AuthService } from './service.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
    accessToken: string;
  }
  interface FastifyContextConfig {
    /** Routes a user can call before finishing the first login (spec 8.1). */
    allowPendingPassword?: boolean;
    public?: boolean;
  }
}

const bearer = (req: FastifyRequest) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AppError('UNAUTHORIZED');
  return header.slice(7);
};

export async function authRoutes(
  app: FastifyInstance,
  opts: { auth: AuthService; maxLoginAttempts: number },
) {
  const { auth } = opts;
  const byIdentifier = new AttemptLimiter(opts.maxLoginAttempts);
  const byIp = new AttemptLimiter(opts.maxLoginAttempts);

  // Every route needs a valid session unless marked `public`; pending users only get the allowed ones.
  app.addHook('preHandler', async (req) => {
    if (req.routeOptions.config.public) return;
    req.accessToken = bearer(req);
    req.auth = await auth.authenticate(req.accessToken);
    if (req.auth.mustChangePassword && !req.routeOptions.config.allowPendingPassword) {
      throw new AppError('PASSWORD_CHANGE_REQUIRED');
    }
  });

  app.post('/auth/login', { config: { public: true } }, async (req, reply) => {
    const body = loginInput.parse(req.body);
    try {
      byIp.hit(req.ip);
      byIdentifier.hit(body.identifier);
    } catch (err) {
      if (err instanceof AppError && typeof err.details?.retryAfterSeconds === 'number') {
        reply.header('Retry-After', err.details.retryAfterSeconds);
      }
      throw err;
    }
    return auth.login(body.identifier, body.password);
  });

  app.post('/auth/refresh', { config: { public: true } }, async (req) =>
    auth.refresh(refreshInput.parse(req.body).refreshToken),
  );

  app.post('/auth/first-login', { config: { allowPendingPassword: true } }, async (req) =>
    auth.firstLogin(req.auth.id, firstLoginInput.parse(req.body)),
  );

  app.post('/auth/change-password', async (req, reply) => {
    const body = changePasswordInput.parse(req.body);
    await auth.changePassword(req.auth.id, body.currentPassword, body.newPassword);
    return reply.status(204).send();
  });

  app.post('/auth/logout', { config: { allowPendingPassword: true } }, async (req, reply) => {
    await auth.logout(req.accessToken);
    return reply.status(204).send();
  });

  app.get('/me', { config: { allowPendingPassword: true } }, async (req) => auth.me(req.auth.id));

  app.patch('/me/preferences', async (req) =>
    auth.updatePreferences(req.auth, preferencesInput.parse(req.body)),
  );
}

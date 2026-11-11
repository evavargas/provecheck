import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../lib/errors.js';
import type { AuthContext, AuthService } from '../modules/auth/service.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext;
    accessToken: string;
  }
  interface FastifyContextConfig {
    /** Routes a user can call before finishing the first login (spec 8.1). */
    allowPendingPassword?: boolean;
    /** No session needed (login, refresh). */
    public?: boolean;
  }
}

const bearer = (req: FastifyRequest) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) throw new AppError('UNAUTHORIZED');
  return header.slice(7);
};

/**
 * Every route in this scope needs a valid session unless marked `public`.
 * Users who still must change their password only reach routes marked `allowPendingPassword`.
 */
export function authGuard(app: FastifyInstance, auth: AuthService) {
  app.addHook('preHandler', async (req) => {
    if (req.routeOptions.config.public) return;
    req.accessToken = bearer(req);
    req.auth = await auth.authenticate(req.accessToken);
    if (req.auth.mustChangePassword && !req.routeOptions.config.allowPendingPassword) {
      throw new AppError('PASSWORD_CHANGE_REQUIRED');
    }
  });
}

export function requireAdmin(req: FastifyRequest) {
  if (req.auth.role !== 'admin') throw new AppError('FORBIDDEN');
}

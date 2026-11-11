import {
  availabilityQuery,
  clientCompanyInput,
  createUserInput,
  listUsersQuery,
  resetPasswordInput,
  updateUserInput,
  type CompanyOptionDto,
} from '@provecheck/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Db } from '../../plugins/db.js';
import { requireAdmin } from '../../plugins/auth-guard.js';
import type { UsersService } from './service.js';

const idParams = z.object({ id: z.string().uuid() });

export async function usersRoutes(app: FastifyInstance, opts: { users: UsersService; db: Db }) {
  const { users, db } = opts;
  app.addHook('preHandler', async (req) => requireAdmin(req));

  app.get('/users', async (req) => users.list(req.auth, listUsersQuery.parse(req.query)));

  // Registered before /users/:id so "availability" is never read as an id.
  app.get('/users/availability', async (req) => {
    const q = availabilityQuery.parse(req.query);
    return users.availability(q.identifier, q.exceptUserId);
  });

  app.post('/users', async (req, reply) =>
    reply.status(201).send(await users.create(req.auth, createUserInput.parse(req.body))),
  );

  app.get('/users/:id', async (req) => users.get(req.auth, idParams.parse(req.params).id));

  app.patch('/users/:id', async (req) =>
    users.update(req.auth, idParams.parse(req.params).id, updateUserInput.parse(req.body)),
  );

  app.patch('/users/:id/client-company', async (req) =>
    users.setClientCompany(
      req.auth,
      idParams.parse(req.params).id,
      clientCompanyInput.parse(req.body).clientCompanyId,
    ),
  );

  app.post('/users/:id/deactivate', async (req) =>
    users.deactivate(req.auth, idParams.parse(req.params).id),
  );
  app.post('/users/:id/reactivate', async (req) =>
    users.reactivate(req.auth, idParams.parse(req.params).id),
  );

  app.post('/users/:id/reset-password', async (req, reply) => {
    await users.resetPassword(
      req.auth,
      idParams.parse(req.params).id,
      resetPasswordInput.parse(req.body).temporaryPassword,
    );
    return reply.status(204).send();
  });

  // Options for the client-user form; the full companies module (P-07) comes later.
  app.get('/client-companies', async (req): Promise<{ items: CompanyOptionDto[] }> => {
    const { rows } = await db.asActor(req.auth, (c) =>
      c.query<CompanyOptionDto>(
        'SELECT id, legal_name AS name FROM client_companies WHERE active ORDER BY legal_name',
      ),
    );
    return { items: rows };
  });
}

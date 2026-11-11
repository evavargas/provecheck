import {
  createCompanyInput,
  listCompaniesQuery,
  listServiceTypesQuery,
  serviceTypeInput,
  updateCompanyInput,
  updateServiceTypeInput,
} from '@provecheck/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../plugins/auth-guard.js';
import type { CatalogsService } from './service.js';

const idParams = z.object({ id: z.string().uuid() });

export async function catalogsRoutes(app: FastifyInstance, opts: { catalogs: CatalogsService }) {
  const { catalogs } = opts;
  app.addHook('preHandler', async (req) => requireAdmin(req));

  app.get('/client-companies', async (req) =>
    catalogs.listCompanies(req.auth, listCompaniesQuery.parse(req.query)),
  );
  // Registered before /:id so "options" is never read as an id.
  app.get('/client-companies/options', async (req) => catalogs.companyOptions(req.auth));
  app.post('/client-companies', async (req, reply) =>
    reply
      .status(201)
      .send(await catalogs.createCompany(req.auth, createCompanyInput.parse(req.body))),
  );
  app.patch('/client-companies/:id', async (req) =>
    catalogs.updateCompany(
      req.auth,
      idParams.parse(req.params).id,
      updateCompanyInput.parse(req.body),
    ),
  );
  app.post('/client-companies/:id/deactivate', async (req) =>
    catalogs.deactivateCompany(req.auth, idParams.parse(req.params).id),
  );
  app.post('/client-companies/:id/reactivate', async (req) =>
    catalogs.reactivateCompany(req.auth, idParams.parse(req.params).id),
  );

  app.get('/service-types', async (req) =>
    catalogs.listServiceTypes(req.auth, listServiceTypesQuery.parse(req.query).active),
  );
  app.post('/service-types', async (req, reply) =>
    reply
      .status(201)
      .send(await catalogs.createServiceType(req.auth, serviceTypeInput.parse(req.body).name)),
  );
  app.patch('/service-types/:id', async (req) =>
    catalogs.updateServiceType(
      req.auth,
      idParams.parse(req.params).id,
      updateServiceTypeInput.parse(req.body),
    ),
  );
}

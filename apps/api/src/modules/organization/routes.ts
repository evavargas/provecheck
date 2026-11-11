import { listAuditQuery, presignLogoInput, updateOrganizationInput } from '@provecheck/shared';
import type { FastifyInstance } from 'fastify';
import { requireAdmin } from '../../plugins/auth-guard.js';
import type { OrganizationService } from './service.js';

export async function organizationRoutes(app: FastifyInstance, opts: { org: OrganizationService }) {
  const { org } = opts;
  app.addHook('preHandler', async (req) => requireAdmin(req));

  app.get('/organization', async (req) => org.get(req.auth));
  app.patch('/organization', async (req) =>
    org.update(req.auth, updateOrganizationInput.parse(req.body)),
  );
  app.post('/organization/logo/presign', async (req) =>
    org.presignLogo(req.auth, presignLogoInput.parse(req.body).contentType),
  );
  app.post('/organization/logo/confirm', async (req) =>
    org.confirmLogo(
      req.auth,
      presignLogoInput.pick({ contentType: true }).parse(req.body).contentType,
    ),
  );
  app.delete('/organization/logo', async (req) => org.removeLogo(req.auth));
  app.get('/audit', async (req) => org.audit(req.auth, listAuditQuery.parse(req.query)));
}

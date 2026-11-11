import { listObjectionsQuery, listRatingsQuery, updateObjectionInput } from '@provecheck/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../plugins/auth-guard.js';
import type { FeedbackAdmin } from './admin.js';

const idParams = z.object({ id: z.string().uuid() });
const rangeQuery = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
});

export async function feedbackRoutes(app: FastifyInstance, opts: { feedback: FeedbackAdmin }) {
  const { feedback } = opts;
  app.addHook('preHandler', async (req) => requireAdmin(req));

  app.get('/objections', async (req) =>
    feedback.listObjections(req.auth, listObjectionsQuery.parse(req.query)),
  );
  app.get('/objections/:id', async (req) =>
    feedback.getObjection(req.auth, idParams.parse(req.params).id),
  );
  app.patch('/objections/:id', async (req) =>
    feedback.updateObjection(
      req.auth,
      idParams.parse(req.params).id,
      updateObjectionInput.parse(req.body),
    ),
  );
  app.get('/ratings', async (req) =>
    feedback.listRatings(req.auth, listRatingsQuery.parse(req.query)),
  );
  // Registered with a fixed path, so it never collides with an id.
  app.get('/ratings/summary', async (req) =>
    feedback.ratingSummary(req.auth, rangeQuery.parse(req.query)),
  );
}

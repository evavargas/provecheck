import {
  arrivalInput,
  assignmentInput,
  cancelTaskInput,
  createTaskInput,
  draftInput,
  fileObjectionInput,
  finalizeInput,
  presignAttachmentInput,
  ratingInput,
  presignPhotoInput,
  listTasksQuery,
  updateTaskInput,
} from '@provecheck/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../plugins/auth-guard.js';
import { AppError } from '../../lib/errors.js';
import type { CollaboratorTasks } from './collaborator.js';
import type { ClientTasks } from '../feedback/client.js';
import type { TaskMedia } from './media.js';
import type { TasksService } from './service.js';

const idParams = z.object({ id: z.string().uuid() });
const photoParams = idParams.extend({ photoId: z.string().uuid() });
const resendInput = z.object({ recipientOverride: z.string().email().optional() }).strict();
const assignmentParams = idParams.extend({ aid: z.string().uuid() });

// Admin routes check the role per route; shared paths return a DTO by role (RN-13).
export async function tasksRoutes(
  app: FastifyInstance,
  opts: { tasks: TasksService; collab: CollaboratorTasks; media: TaskMedia; client: ClientTasks },
) {
  const { tasks, collab, media, client } = opts;
  const admin = { preHandler: async (req: FastifyRequest) => requireAdmin(req) };
  const collaboratorOnly = (req: FastifyRequest) => {
    if (req.auth.role !== 'collaborator') throw new AppError('FORBIDDEN');
  };

  // Same path for every role, a different DTO each (spec 8.2). Client users get theirs with their own module.
  app.get('/tasks', async (req) => {
    const q = listTasksQuery.parse(req.query);
    if (req.auth.role === 'admin') return tasks.list(req.auth, q);
    if (req.auth.role === 'client_user') return client.list(req.auth);
    collaboratorOnly(req);
    return collab.list(req.auth, q);
  });
  app.post('/tasks', admin, async (req, reply) =>
    reply.status(201).send(await tasks.create(req.auth, createTaskInput.parse(req.body))),
  );
  app.get('/tasks/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    if (req.auth.role === 'admin') return tasks.get(req.auth, id);
    if (req.auth.role === 'client_user') return client.get(req.auth, id);
    collaboratorOnly(req);
    return collab.get(req.auth, id);
  });
  app.post('/tasks/:id/arrival', async (req) => {
    collaboratorOnly(req);
    return collab.arrival(req.auth, idParams.parse(req.params).id, arrivalInput.parse(req.body));
  });
  app.post('/tasks/:id/finalize', async (req) => {
    collaboratorOnly(req);
    return collab.finalize(req.auth, idParams.parse(req.params).id, finalizeInput.parse(req.body));
  });
  app.post('/tasks/:id/photos/presign', async (req) => {
    collaboratorOnly(req);
    return media.presign(
      req.auth,
      idParams.parse(req.params).id,
      presignPhotoInput.parse(req.body),
    );
  });
  app.post('/tasks/:id/photos/:photoId/confirm', async (req, reply) => {
    collaboratorOnly(req);
    const p = photoParams.parse(req.params);
    await media.confirm(req.auth, p.id, p.photoId);
    return reply.status(204).send();
  });
  app.get('/tasks/:id/report', async (req) => {
    return media.report(req.auth, idParams.parse(req.params).id);
  });
  const clientOnly = (req: FastifyRequest) => {
    if (req.auth.role !== 'client_user') throw new AppError('FORBIDDEN');
  };
  app.post('/tasks/:id/objection/attachments/presign', async (req) => {
    clientOnly(req);
    return client.presignAttachment(
      req.auth,
      idParams.parse(req.params).id,
      presignAttachmentInput.parse(req.body),
    );
  });
  app.post('/tasks/:id/objection/attachments/:attachmentId/confirm', async (req, reply) => {
    clientOnly(req);
    const p = idParams.extend({ attachmentId: z.string().uuid() }).parse(req.params);
    await client.confirmAttachment(req.auth, p.id, p.attachmentId);
    return reply.status(204).send();
  });
  app.post('/tasks/:id/objection', async (req, reply) => {
    clientOnly(req);
    return reply
      .status(201)
      .send(
        await client.fileObjection(
          req.auth,
          idParams.parse(req.params).id,
          fileObjectionInput.parse(req.body),
        ),
      );
  });
  app.put('/tasks/:id/ratings/:assignmentId', async (req) => {
    clientOnly(req);
    const p = idParams.extend({ assignmentId: z.string().uuid() }).parse(req.params);
    return client.rate(req.auth, p.id, p.assignmentId, ratingInput.parse(req.body));
  });
  app.get('/tasks/:id/pdf', async (req) => media.document(req.auth, idParams.parse(req.params).id));
  app.get('/tasks/:id/outbox', admin, async (req) =>
    media.outbox(req.auth, idParams.parse(req.params).id),
  );
  app.post('/tasks/:id/resend-pdf', admin, async (req, reply) => {
    await media.resend(
      req.auth,
      idParams.parse(req.params).id,
      resendInput.parse(req.body ?? {}).recipientOverride,
    );
    return reply.status(204).send();
  });
  app.get('/tasks/:id/draft', async (req) => {
    collaboratorOnly(req);
    return collab.getDraft(req.auth, idParams.parse(req.params).id);
  });
  app.put('/tasks/:id/draft', async (req, reply) => {
    collaboratorOnly(req);
    await collab.putDraft(
      req.auth,
      idParams.parse(req.params).id,
      draftInput.parse(req.body).contentJson,
    );
    return reply.status(204).send();
  });
  app.patch('/tasks/:id', admin, async (req) =>
    tasks.update(req.auth, idParams.parse(req.params).id, updateTaskInput.parse(req.body)),
  );
  app.post('/tasks/:id/cancel', admin, async (req) =>
    tasks.cancel(req.auth, idParams.parse(req.params).id, cancelTaskInput.parse(req.body).reason),
  );
  app.post('/tasks/:id/assignments', admin, async (req, reply) =>
    reply
      .status(201)
      .send(
        await tasks.addAssignment(
          req.auth,
          idParams.parse(req.params).id,
          assignmentInput.parse(req.body),
        ),
      ),
  );
  app.post('/tasks/:id/assignments/:aid/replace', admin, async (req) => {
    const p = assignmentParams.parse(req.params);
    return tasks.replaceAssignment(req.auth, p.id, p.aid, assignmentInput.parse(req.body));
  });
}

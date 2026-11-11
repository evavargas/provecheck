import {
  arrivalInput,
  assignmentInput,
  cancelTaskInput,
  createTaskInput,
  draftInput,
  finalizeInput,
  listTasksQuery,
  updateTaskInput,
} from '@provecheck/shared';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../plugins/auth-guard.js';
import { AppError } from '../../lib/errors.js';
import type { CollaboratorTasks } from './collaborator.js';
import type { TasksService } from './service.js';

const idParams = z.object({ id: z.string().uuid() });
const assignmentParams = idParams.extend({ aid: z.string().uuid() });

// Admin routes check the role per route; shared paths return a DTO by role (RN-13).
export async function tasksRoutes(
  app: FastifyInstance,
  opts: { tasks: TasksService; collab: CollaboratorTasks },
) {
  const { tasks, collab } = opts;
  const admin = { preHandler: async (req: FastifyRequest) => requireAdmin(req) };
  const collaboratorOnly = (req: FastifyRequest) => {
    if (req.auth.role !== 'collaborator') throw new AppError('FORBIDDEN');
  };

  // Same path for every role, a different DTO each (spec 8.2). Client users get theirs with their own module.
  app.get('/tasks', async (req) => {
    const q = listTasksQuery.parse(req.query);
    if (req.auth.role === 'admin') return tasks.list(req.auth, q);
    collaboratorOnly(req);
    return collab.list(req.auth, q);
  });
  app.post('/tasks', admin, async (req, reply) =>
    reply.status(201).send(await tasks.create(req.auth, createTaskInput.parse(req.body))),
  );
  app.get('/tasks/:id', async (req) => {
    const { id } = idParams.parse(req.params);
    if (req.auth.role === 'admin') return tasks.get(req.auth, id);
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

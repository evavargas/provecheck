import {
  assignmentInput,
  cancelTaskInput,
  createTaskInput,
  listTasksQuery,
  updateTaskInput,
} from '@provecheck/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAdmin } from '../../plugins/auth-guard.js';
import type { TasksService } from './service.js';

const idParams = z.object({ id: z.string().uuid() });
const assignmentParams = idParams.extend({ aid: z.string().uuid() });

// Admin only for now: the collaborator and client views come with their own DTOs (RN-13).
export async function tasksRoutes(app: FastifyInstance, opts: { tasks: TasksService }) {
  const { tasks } = opts;
  app.addHook('preHandler', async (req) => requireAdmin(req));

  app.get('/tasks', async (req) => tasks.list(req.auth, listTasksQuery.parse(req.query)));
  app.post('/tasks', async (req, reply) =>
    reply.status(201).send(await tasks.create(req.auth, createTaskInput.parse(req.body))),
  );
  app.get('/tasks/:id', async (req) => tasks.get(req.auth, idParams.parse(req.params).id));
  app.patch('/tasks/:id', async (req) =>
    tasks.update(req.auth, idParams.parse(req.params).id, updateTaskInput.parse(req.body)),
  );
  app.post('/tasks/:id/cancel', async (req) =>
    tasks.cancel(req.auth, idParams.parse(req.params).id, cancelTaskInput.parse(req.body).reason),
  );
  app.post('/tasks/:id/assignments', async (req, reply) =>
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
  app.post('/tasks/:id/assignments/:aid/replace', async (req) => {
    const p = assignmentParams.parse(req.params);
    return tasks.replaceAssignment(req.auth, p.id, p.aid, assignmentInput.parse(req.body));
  });
}

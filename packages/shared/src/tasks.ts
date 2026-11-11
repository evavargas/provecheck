import { z } from 'zod';
import { TASK_STATUSES, type TaskStatus } from './enums';

const money = z.number().min(0).max(9_999_999_999.99);
const uuid = z.string().uuid();
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

export const assignmentInput = z
  .object({ collaboratorId: uuid, feeUyu: money.nullable().optional() })
  .strict();
export type AssignmentInput = z.input<typeof assignmentInput>;

const taskFields = {
  clientCompanyId: uuid.nullable(),
  clientUserId: uuid.nullable(),
  address: z.string().trim().min(1).max(240),
  recipientName: optionalText(120),
  scheduledStartAt: z.string().datetime({ offset: true }),
  assignedHours: z.number().positive().max(999).nullable(),
  description: z.string().trim().min(1).max(4000),
  instructions: optionalText(4000),
  serviceTypeId: uuid.nullable(),
  costUyu: money.nullable(),
};

/** RN-2 and RN-27 are checked in the service: the recipient needs a company or a client user, and at least one collaborator. */
export const createTaskInput = z
  .object(taskFields)
  .partial({
    clientCompanyId: true,
    clientUserId: true,
    address: true,
    recipientName: true,
    assignedHours: true,
    instructions: true,
    serviceTypeId: true,
    costUyu: true,
  })
  .extend({ assignments: z.array(assignmentInput).max(20).default([]) })
  .strict();
export type CreateTaskInput = z.input<typeof createTaskInput>;
export type TaskWrite = z.output<typeof createTaskInput>;

export const updateTaskInput = z.object(taskFields).partial().strict();
export type UpdateTaskInput = z.input<typeof updateTaskInput>;
export type TaskPatch = z.output<typeof updateTaskInput>;

export const cancelTaskInput = z.object({ reason: z.string().trim().min(1).max(500) }).strict();
export const replaceAssignmentInput = assignmentInput;

const csv = z
  .string()
  .transform((v) => v.split(',').filter(Boolean))
  .pipe(z.array(z.enum(TASK_STATUSES)));
export const listTasksQuery = z.object({
  status: csv.optional(),
  clientCompanyId: uuid.optional(),
  clientUserId: uuid.optional(),
  collaboratorId: uuid.optional(),
  serviceTypeId: uuid.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  hasObjection: z.enum(['true']).optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(300).optional(),
});
export type ListTasksParams = {
  status?: TaskStatus[];
  clientCompanyId?: string;
  clientUserId?: string;
  collaboratorId?: string;
  serviceTypeId?: string;
  from?: string;
  to?: string;
  hasObjection?: boolean;
  q?: string;
  cursor?: string;
};

export interface AssignmentDto {
  id: string;
  collaboratorId: string;
  collaboratorName: string;
  feeUyu: number | null;
  arrivedAt: string | null;
  attendanceDelayed: boolean;
  active: boolean;
}

/** Admin view: it includes costs (RN-13), which never travel to other roles. */
export interface TaskDto {
  id: string;
  status: TaskStatus;
  clientCompanyId: string | null;
  clientCompanyName: string | null;
  clientUserId: string | null;
  clientUserName: string | null;
  address: string;
  recipientName: string | null;
  scheduledStartAt: string;
  assignedHours: number | null;
  description: string;
  instructions: string | null;
  serviceTypeId: string | null;
  serviceTypeName: string | null;
  costUyu: number | null;
  completedAt: string | null;
  objectionDeadlineAt: string | null;
  cancellationReason: string | null;
  createdAt: string;
  assignments: AssignmentDto[];
}

export interface TaskList {
  items: TaskDto[];
  nextCursor: string | null;
}

import { z } from 'zod';
import { reportContentSchema, type ReportContent } from './report';
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

/** What a collaborator sees (spec 8.2): no costs, no fees, no ratings. Co-assigned people appear by name only. */
export interface CollaboratorTaskDto {
  id: string;
  status: TaskStatus;
  address: string;
  recipientName: string | null;
  scheduledStartAt: string;
  assignedHours: number | null;
  description: string;
  instructions: string | null;
  serviceTypeName: string | null;
  clientCompanyName: string | null;
  /** Informational contact phone of the company (RN-4); the app offers to call it. */
  clientCompanyPhone: string | null;
  completedAt: string | null;
  team: { collaboratorId: string; name: string; active: boolean; arrivedAt: string | null }[];
  /** The caller's own arrival, if any. */
  myArrivedAt: string | null;
  myAttendanceDelayed: boolean;
}

export interface CollaboratorTaskList {
  items: CollaboratorTaskDto[];
}

export const arrivalInput = z
  .object({
    clientEventId: z.string().uuid().optional(),
    deviceArrivedAt: z.string().datetime({ offset: true }),
    attendanceDelayed: z.boolean(),
  })
  .strict();
export type ArrivalInput = z.input<typeof arrivalInput>;

export const finalizeInput = z
  .object({
    reportId: z.string().uuid(),
    contentJson: reportContentSchema,
    deviceCompletedAt: z.string().datetime({ offset: true }),
    deviceSentAt: z.string().datetime({ offset: true }),
    // Evidence photos already uploaded and confirmed, in display order (RN-17: at most 25).
    photoIds: z.array(z.string().uuid()).max(25).default([]),
  })
  .strict();
export type FinalizeInput = z.input<typeof finalizeInput>;
export const draftInput = z.object({ contentJson: z.unknown() }).strict();

export interface ReportDto {
  id: string;
  html: string;
  completedBy: string;
  completedAt: string;
}

/** Largest allowed size for each stored version of a photo, after compression on the device (spec 8.4). */
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const MAX_PHOTOS_PER_REPORT = 25;

export const presignPhotoInput = z
  .object({
    photoId: z.string().uuid(),
    position: z.number().int().min(0).max(24),
    bytes: z.number().int().positive().max(MAX_PHOTO_BYTES),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export type PresignPhotoInput = z.input<typeof presignPhotoInput>;

export interface PresignedPhotoDto {
  photoId: string;
  /** PUT the compressed JPEG for each version to its URL. */
  uploads: { original: string; thumb: string; pdf: string };
}

export interface ReportPhotoDto {
  id: string;
  position: number;
  status: 'uploading' | 'uploaded' | 'expired';
  /** Short-lived read URLs; absent once the photo expired (RN-16). */
  thumbUrl: string | null;
  originalUrl: string | null;
}

export interface TaskReportDto extends ReportDto {
  /** The structured record, so the phone can render it without HTML. */
  content: ReportContent;
  photos: ReportPhotoDto[];
}

export interface TaskDocumentDto {
  url: string;
  version: number;
  generatedAt: string;
}

export interface OutboxDto {
  id: string;
  recipient: string | null;
  status: 'pending' | 'sent' | 'failed' | 'skipped_no_contact';
  attempts: number;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
}

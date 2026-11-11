import { z } from 'zod';
import type { TaskStatus } from './enums';

export const OBJECTION_STATUSES = ['open', 'in_review', 'resolved'] as const;
export type ObjectionStatus = (typeof OBJECTION_STATUSES)[number];
export const MAX_OBJECTION_ATTACHMENTS = 5;

const uuid = z.string().uuid();

export const presignAttachmentInput = z
  .object({
    attachmentId: uuid,
    stagingId: uuid,
    position: z.number().int().min(0).max(4),
    bytes: z
      .number()
      .int()
      .positive()
      .max(3 * 1024 * 1024),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
export type PresignAttachmentInput = z.input<typeof presignAttachmentInput>;

export const fileObjectionInput = z
  .object({
    stagingId: uuid,
    description: z.string().trim().min(5).max(4000),
    attachmentIds: z.array(uuid).max(MAX_OBJECTION_ATTACHMENTS).default([]),
  })
  .strict();
export type FileObjectionInput = z.input<typeof fileObjectionInput>;

export const ratingInput = z
  .object({
    stars: z.number().int().min(1).max(5),
    comment: z
      .string()
      .trim()
      .max(1000)
      .transform((v) => v || null)
      .optional(),
  })
  .strict();
export type RatingInput = z.input<typeof ratingInput>;
export type RatingWrite = z.output<typeof ratingInput>;

export const updateObjectionInput = z
  .object({ status: z.enum(OBJECTION_STATUSES), internalNotes: z.string().trim().max(4000) })
  .partial()
  .strict();
export type UpdateObjectionInput = z.input<typeof updateObjectionInput>;

export const listObjectionsQuery = z.object({
  status: z.enum(OBJECTION_STATUSES).optional(),
  clientCompanyId: uuid.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListObjectionsParams = {
  status?: ObjectionStatus;
  clientCompanyId?: string;
  from?: string;
  to?: string;
};

export const listRatingsQuery = z.object({
  collaboratorId: uuid.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});
export type ListRatingsParams = { collaboratorId?: string; from?: string; to?: string };

export interface PresignedAttachmentDto {
  attachmentId: string;
  uploads: { original: string; thumb: string };
}

export interface AttachmentDto {
  id: string;
  position: number;
  status: 'uploading' | 'uploaded' | 'expired';
  thumbUrl: string | null;
  originalUrl: string | null;
}

/** What the client user sees of their objection: never the admin's internal notes (RN-22). */
export interface ClientObjectionDto {
  description: string;
  status: ObjectionStatus;
  createdAt: string;
  attachments: AttachmentDto[];
}

export interface ClientTaskDto {
  id: string;
  status: TaskStatus;
  address: string;
  recipientName: string | null;
  scheduledStartAt: string;
  completedAt: string | null;
  serviceTypeName: string | null;
  clientCompanyName: string | null;
  objectionDeadlineAt: string | null;
  canFileObjection: boolean;
  canRate: boolean;
  /** Derived by comparing the deadline with now (RN-6); there is no job. */
  closed: boolean;
  team: {
    assignmentId: string;
    name: string;
    arrivedAt: string | null;
    attendanceDelayed: boolean;
    myRating: { stars: number; comment: string | null } | null;
  }[];
  objection: ClientObjectionDto | null;
}

export interface ClientTaskList {
  items: ClientTaskDto[];
}

export interface ObjectionRowDto {
  id: string;
  taskId: string;
  status: ObjectionStatus;
  createdAt: string;
  ageDays: number;
  address: string;
  recipient: string;
  author: { name: string; email: string; phone: string };
}

export interface ObjectionDetailDto extends ObjectionRowDto {
  description: string;
  internalNotes: string | null;
  updatedAt: string;
  scheduledStartAt: string;
  taskStatus: TaskStatus;
  attachments: AttachmentDto[];
}

export interface RatingRowDto {
  id: string;
  stars: number;
  comment: string | null;
  collaboratorId: string;
  collaboratorName: string;
  taskId: string;
  address: string;
  authorName: string;
  createdAt: string;
}

export interface RatingSummaryDto {
  collaboratorId: string;
  collaboratorName: string;
  average: number;
  count: number;
  /** Index 0 is one star, index 4 is five. */
  distribution: [number, number, number, number, number];
}

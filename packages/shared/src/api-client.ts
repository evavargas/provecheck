import type {
  Availability,
  CompanyOptionDto,
  CreateUserInput,
  ListUsersParams,
  UpdateUserInput,
  UserDto,
  UserList,
  Replacement,
} from './users';
import type {
  CompanyDto,
  CompanyList,
  CreateCompanyInput,
  ListCompaniesParams,
  ServiceTypeDto,
  UpdateCompanyInput,
} from './catalogs';
import type { TaskStatus } from './enums';
import type {
  ListObjectionsParams,
  ListRatingsParams,
  ObjectionDetailDto,
  ObjectionRowDto,
  RatingRowDto,
  RatingSummaryDto,
  UpdateObjectionInput,
} from './feedback';
import type {
  OutboxDto,
  TaskDocumentDto,
  TaskReportDto,
  PresignPhotoInput,
  PresignedPhotoDto,
  ArrivalInput,
  CollaboratorTaskDto,
  CollaboratorTaskList,
  FinalizeInput,
  ReportDto,
  AssignmentInput,
  CreateTaskInput,
  ListTasksParams,
  TaskDto,
  TaskList,
  UpdateTaskInput,
} from './tasks';
import type { ApiError, ErrorCode } from './errors';
import type {
  FirstLoginInput,
  LoginInput,
  LoginResponse,
  MeDto,
  PreferencesInput,
  SessionDto,
} from './auth';

export class ApiRequestError extends Error {
  constructor(
    readonly code: ErrorCode | 'NETWORK',
    readonly status: number,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

/** Where the session lives is up to each app (web storage, secure storage on mobile). */
export interface SessionStore {
  get(): SessionDto | null;
  set(session: SessionDto | null): void;
}

export interface ApiClientOptions {
  baseUrl: string;
  store: SessionStore;
  fetchImpl?: typeof fetch;
  /** Called when the refresh token is rejected, so the app can go back to the login screen. */
  onSessionLost?: () => void;
}

const query = (params: Record<string, string | number | boolean | undefined>) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params))
    if (v !== undefined && v !== '') qs.set(k, String(v));
  const text = qs.toString();
  return text ? `?${text}` : '';
};

export function createApiClient(opts: ApiClientOptions) {
  const doFetch = opts.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  let refreshing: Promise<boolean> | null = null;

  async function send(
    method: string,
    path: string,
    body: unknown,
    token: string | null,
  ): Promise<Response> {
    try {
      return await doFetch(`${opts.baseUrl}${path}`, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiRequestError('NETWORK', 0);
    }
  }

  // One refresh at a time: concurrent 401s share the same attempt.
  function refresh(): Promise<boolean> {
    refreshing ??= (async () => {
      const current = opts.store.get();
      if (!current) return false;
      const res = await send('POST', '/auth/refresh', { refreshToken: current.refreshToken }, null);
      if (!res.ok) {
        opts.store.set(null);
        opts.onSessionLost?.();
        return false;
      }
      opts.store.set(((await res.json()) as LoginResponse).session);
      return true;
    })().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function request<T>(method: string, path: string, body?: unknown, auth = true): Promise<T> {
    let res = await send(method, path, body, auth ? (opts.store.get()?.accessToken ?? null) : null);
    if (res.status === 401 && auth && opts.store.get() && (await refresh())) {
      res = await send(method, path, body, opts.store.get()?.accessToken ?? null);
    }
    if (!res.ok) {
      const err = (await res.json().catch(() => ({ code: 'INTERNAL' }))) as ApiError;
      throw new ApiRequestError(err.code, res.status, err.details);
    }
    return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
  }

  return {
    async login(input: LoginInput): Promise<LoginResponse> {
      const res = await request<LoginResponse>('POST', '/auth/login', input, false);
      opts.store.set(res.session);
      return res;
    },
    me: () => request<MeDto>('GET', '/me'),
    firstLogin: (input: FirstLoginInput) => request<MeDto>('POST', '/auth/first-login', input),
    changePassword: (input: { currentPassword: string; newPassword: string }) =>
      request<void>('POST', '/auth/change-password', input),
    updatePreferences: (input: PreferencesInput) =>
      request<MeDto>('PATCH', '/me/preferences', input),
    users: {
      list: (params: ListUsersParams = {}) => request<UserList>('GET', `/users${query(params)}`),
      get: (id: string) => request<UserDto>('GET', `/users/${id}`),
      availability: (identifier: string, exceptUserId?: string) =>
        request<Availability>('GET', `/users/availability${query({ identifier, exceptUserId })}`),
      create: (input: CreateUserInput) => request<UserDto>('POST', '/users', input),
      update: (id: string, input: UpdateUserInput) =>
        request<UserDto>('PATCH', `/users/${id}`, input),
      setClientCompany: (id: string, clientCompanyId: string | null) =>
        request<UserDto>('PATCH', `/users/${id}/client-company`, { clientCompanyId }),
      deactivate: (id: string, replacements: Replacement[] = []) =>
        request<UserDto>('POST', `/users/${id}/deactivate`, { replacements }),
      reactivate: (id: string) => request<UserDto>('POST', `/users/${id}/reactivate`),
      resetPassword: (id: string, temporaryPassword: string) =>
        request<void>('POST', `/users/${id}/reset-password`, { temporaryPassword }),
    },
    companyOptions: () =>
      request<{ items: CompanyOptionDto[] }>('GET', '/client-companies/options'),
    companies: {
      list: (params: ListCompaniesParams = {}) =>
        request<CompanyList>('GET', `/client-companies${query(params)}`),
      create: (input: CreateCompanyInput) =>
        request<CompanyDto>('POST', '/client-companies', input),
      update: (id: string, input: UpdateCompanyInput) =>
        request<CompanyDto>('PATCH', `/client-companies/${id}`, input),
      deactivate: (id: string) => request<CompanyDto>('POST', `/client-companies/${id}/deactivate`),
      reactivate: (id: string) => request<CompanyDto>('POST', `/client-companies/${id}/reactivate`),
    },
    myTasks: {
      list: (params: { status?: TaskStatus[] } = {}) =>
        request<CollaboratorTaskList>(
          'GET',
          `/tasks${query({ status: params.status?.join(',') })}`,
        ),
      get: (id: string) => request<CollaboratorTaskDto>('GET', `/tasks/${id}`),
      arrival: (id: string, input: ArrivalInput) =>
        request<CollaboratorTaskDto>('POST', `/tasks/${id}/arrival`, input),
      finalize: (id: string, input: FinalizeInput) =>
        request<{ report: ReportDto }>('POST', `/tasks/${id}/finalize`, input),
      presignPhoto: (id: string, input: PresignPhotoInput) =>
        request<PresignedPhotoDto>('POST', `/tasks/${id}/photos/presign`, input),
      confirmPhoto: (id: string, photoId: string) =>
        request<void>('POST', `/tasks/${id}/photos/${photoId}/confirm`),
      getDraft: (id: string) => request<{ contentJson: unknown }>('GET', `/tasks/${id}/draft`),
      saveDraft: (id: string, contentJson: unknown) =>
        request<void>('PUT', `/tasks/${id}/draft`, { contentJson }),
    },
    tasks: {
      list: ({ status, ...rest }: ListTasksParams = {}) =>
        request<TaskList>('GET', `/tasks${query({ ...rest, status: status?.join(',') })}`),
      create: (input: CreateTaskInput) => request<TaskDto>('POST', '/tasks', input),
      update: (id: string, input: UpdateTaskInput) =>
        request<TaskDto>('PATCH', `/tasks/${id}`, input),
      cancel: (id: string, reason: string) =>
        request<TaskDto>('POST', `/tasks/${id}/cancel`, { reason }),
      addAssignment: (id: string, input: AssignmentInput) =>
        request<TaskDto>('POST', `/tasks/${id}/assignments`, input),
      replaceAssignment: (id: string, assignmentId: string, input: AssignmentInput) =>
        request<TaskDto>('POST', `/tasks/${id}/assignments/${assignmentId}/replace`, input),
    },
    taskDocs: {
      report: (id: string) => request<TaskReportDto>('GET', `/tasks/${id}/report`),
      pdf: (id: string) => request<TaskDocumentDto>('GET', `/tasks/${id}/pdf`),
      outbox: (id: string) => request<{ items: OutboxDto[] }>('GET', `/tasks/${id}/outbox`),
      resend: (id: string, recipientOverride?: string) =>
        request<void>(
          'POST',
          `/tasks/${id}/resend-pdf`,
          recipientOverride ? { recipientOverride } : {},
        ),
    },
    objections: {
      list: (params: ListObjectionsParams = {}) =>
        request<{ items: ObjectionRowDto[] }>('GET', `/objections${query(params)}`),
      get: (id: string) => request<ObjectionDetailDto>('GET', `/objections/${id}`),
      update: (id: string, input: UpdateObjectionInput) =>
        request<ObjectionDetailDto>('PATCH', `/objections/${id}`, input),
    },
    ratings: {
      summary: () => request<{ items: RatingSummaryDto[] }>('GET', '/ratings/summary'),
      list: (params: ListRatingsParams = {}) =>
        request<{ items: RatingRowDto[] }>('GET', `/ratings${query(params)}`),
    },
    serviceTypes: {
      list: (active?: boolean) =>
        request<{ items: ServiceTypeDto[] }>('GET', `/service-types${query({ active })}`),
      create: (name: string) => request<ServiceTypeDto>('POST', '/service-types', { name }),
      update: (id: string, input: { name?: string; active?: boolean }) =>
        request<ServiceTypeDto>('PATCH', `/service-types/${id}`, input),
    },
    async logout(): Promise<void> {
      try {
        await request<void>('POST', '/auth/logout', {});
      } finally {
        opts.store.set(null);
      }
    },
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

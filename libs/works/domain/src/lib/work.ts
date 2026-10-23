import type { Edition } from './edition.js';

export const WORK_STATUSES = ['draft', 'in-progress', 'complete'] as const;
export type WorkStatus = (typeof WORK_STATUSES)[number];

/** A Work is the aggregate root: its Editions live inside it so their rules can be enforced. */
export interface Work {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly synopsis?: string;
  readonly status: WorkStatus;
  readonly editions: readonly Edition[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type WorksDomainErrorCode =
  'INVALID_WORK' | 'INVALID_EDITION' | 'EDITION_NOT_FOUND' | 'EDITION_CONFLICT';

/** A rule the domain refuses to break. The application decides how that is reported. */
export class WorksDomainError extends Error {
  constructor(
    public readonly code: WorksDomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'WorksDomainError';
  }
}

export const TITLE_MAX = 200;
export const SUBTITLE_MAX = 200;
export const SYNOPSIS_MAX = 5000;

/** Trims; a blank value is absent. Over-long text is refused rather than cut. */
export function optionalText(
  value: string | undefined,
  field: string,
  max: number,
  code: WorksDomainErrorCode,
): string | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed === '') return undefined;
  if (trimmed.length > max) {
    throw new WorksDomainError(code, `The ${field} cannot be longer than ${max} characters.`);
  }
  return trimmed;
}

function title(value: string): string {
  const trimmed = optionalText(value, 'title', TITLE_MAX, 'INVALID_WORK');
  if (trimmed === undefined) throw new WorksDomainError('INVALID_WORK', 'A work needs a title.');
  return trimmed;
}

export interface NewWork {
  readonly title: string;
  readonly subtitle?: string;
  readonly synopsis?: string;
}

export function createWork(id: string, input: NewWork, now: string): Work {
  const subtitle = optionalText(input.subtitle, 'subtitle', SUBTITLE_MAX, 'INVALID_WORK');
  const synopsis = optionalText(input.synopsis, 'synopsis', SYNOPSIS_MAX, 'INVALID_WORK');
  return {
    id,
    title: title(input.title),
    ...(subtitle === undefined ? {} : { subtitle }),
    ...(synopsis === undefined ? {} : { synopsis }),
    status: 'draft',
    editions: [],
    createdAt: now,
    updatedAt: now,
  };
}

export interface WorkPatch {
  readonly title?: string;
  /** An empty string clears it. */
  readonly subtitle?: string;
  /** An empty string clears it. */
  readonly synopsis?: string;
  readonly status?: WorkStatus;
}

export function updateWork(work: Work, patch: WorkPatch, now: string): Work {
  const { subtitle: oldSubtitle, synopsis: oldSynopsis, ...rest } = work;
  const subtitle =
    patch.subtitle === undefined
      ? oldSubtitle
      : optionalText(patch.subtitle, 'subtitle', SUBTITLE_MAX, 'INVALID_WORK');
  const synopsis =
    patch.synopsis === undefined
      ? oldSynopsis
      : optionalText(patch.synopsis, 'synopsis', SYNOPSIS_MAX, 'INVALID_WORK');
  if (patch.status !== undefined && !WORK_STATUSES.includes(patch.status)) {
    throw new WorksDomainError(
      'INVALID_WORK',
      `'${String(patch.status)}' is not a status; use one of ${WORK_STATUSES.join(', ')}.`,
    );
  }
  return {
    ...rest,
    title: patch.title === undefined ? work.title : title(patch.title),
    ...(subtitle === undefined ? {} : { subtitle }),
    ...(synopsis === undefined ? {} : { synopsis }),
    status: patch.status ?? work.status,
    updatedAt: now,
  };
}

import { optionalText, WorksDomainError, type Work } from './work.js';

export type EditionStatus = 'draft' | 'published' | 'superseded';

/** A revision of a Work. At most one Edition of a Work is published at a time. */
export interface Edition {
  readonly number: number;
  readonly label: string;
  readonly status: EditionStatus;
  /** A calendar date, `YYYY-MM-DD`. */
  readonly publishedOn?: string;
  readonly notes?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const LABEL_MAX = 100;
export const NOTES_MAX = 2000;

export interface NewEdition {
  readonly label?: string;
  readonly notes?: string;
}

export function addEdition(work: Work, input: NewEdition, now: string): Work {
  const number =
    work.editions.reduce((highest, edition) => Math.max(highest, edition.number), 0) + 1;
  const label = optionalText(input.label, 'label', LABEL_MAX, 'INVALID_EDITION');
  const notes = optionalText(input.notes, 'notes', NOTES_MAX, 'INVALID_EDITION');
  const edition: Edition = {
    number,
    label: label ?? `Edition ${number}`,
    status: 'draft',
    ...(notes === undefined ? {} : { notes }),
    createdAt: now,
    updatedAt: now,
  };
  return { ...work, editions: [...work.editions, edition], updatedAt: now };
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date: `2026-02-30` is not one, and `2028-02-29` is. */
function isCalendarDate(text: string): boolean {
  const match = DATE.exec(text);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] as number;
  return day <= days;
}

/**
 * Publishes a draft Edition, superseding the one that was published. Without a date the day of
 * `now` is used. A published or superseded Edition is never published again.
 */
export function publishEdition(
  work: Work,
  number: number,
  publishedOn: string | undefined,
  now: string,
): Work {
  const date = publishedOn ?? now.slice(0, 10);
  if (!isCalendarDate(date)) {
    throw new WorksDomainError(
      'INVALID_EDITION',
      `'${date}' is not a calendar date; use YYYY-MM-DD.`,
    );
  }
  const target = work.editions.find((edition) => edition.number === number);
  if (!target) {
    throw new WorksDomainError('EDITION_NOT_FOUND', `This work has no edition ${number}.`);
  }
  if (target.status !== 'draft') {
    throw new WorksDomainError(
      'EDITION_CONFLICT',
      `Edition ${number} is already ${target.status}; only a draft can be published.`,
    );
  }
  const editions = work.editions.map((edition): Edition => {
    if (edition.number === number) {
      return { ...edition, status: 'published', publishedOn: date, updatedAt: now };
    }
    return edition.status === 'published'
      ? { ...edition, status: 'superseded', updatedAt: now }
      : edition;
  });
  return { ...work, editions, updatedAt: now };
}

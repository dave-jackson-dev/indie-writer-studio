import type { Manuscript } from '@indie-writer-studio/manuscript-domain';

/** Persistence for manuscripts, one per Work. */
export interface ManuscriptRepository {
  get(workId: string): Promise<Manuscript | undefined>;
  /**
   * Reads, changes and stores one work's manuscript as a single step no other write can
   * interleave with, so concurrent changes all apply instead of the last one winning. `change`
   * receives `undefined` when the work has no manuscript yet. If it throws, nothing is stored
   * (and nothing is created) and the error passes on.
   */
  update(
    workId: string,
    change: (current: Manuscript | undefined) => Manuscript,
  ): Promise<Manuscript>;
  /** True when there was a manuscript to remove. */
  remove(workId: string): Promise<boolean>;
}

export interface IdGenerator {
  next(): string;
}

export interface Clock {
  /** An ISO-8601 instant. */
  now(): string;
}

export const MANUSCRIPT_REPOSITORY = 'manuscript.ManuscriptRepository';
export const MANUSCRIPT_ID_GENERATOR = 'manuscript.IdGenerator';
export const MANUSCRIPT_CLOCK = 'manuscript.Clock';

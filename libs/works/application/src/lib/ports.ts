import type { Work } from '@indie-writer-studio/works-domain';

/** Persistence for Works. Adapters list in the order works were first saved. */
export interface WorkRepository {
  get(id: string): Promise<Work | undefined>;
  list(): Promise<readonly Work[]>;
  /** Inserts, or replaces in place so the work keeps its position. */
  save(work: Work): Promise<void>;
  /** True when there was a work to remove. */
  remove(id: string): Promise<boolean>;
  /**
   * Reads, changes and stores one work as a single step no other write can interleave with, so
   * concurrent changes all apply instead of the last one winning. Answers `undefined`, without
   * calling `change` or creating anything, when there is no such work. If `change` throws, nothing
   * is stored and the error passes on.
   */
  update(id: string, change: (work: Work) => Work): Promise<Work | undefined>;
}

export interface IdGenerator {
  next(): string;
}

export interface Clock {
  /** An ISO-8601 instant. */
  now(): string;
}

export const WORK_REPOSITORY = 'works.WorkRepository';
export const ID_GENERATOR = 'works.IdGenerator';
export const CLOCK = 'works.Clock';

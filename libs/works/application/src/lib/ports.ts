import type { Work } from '@indie-writer-studio/works-domain';

/** Persistence for Works. Adapters list in the order works were first saved. */
export interface WorkRepository {
  get(id: string): Promise<Work | undefined>;
  list(): Promise<readonly Work[]>;
  /** Inserts, or replaces in place so the work keeps its position. */
  save(work: Work): Promise<void>;
  /** True when there was a work to remove. */
  remove(id: string): Promise<boolean>;
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

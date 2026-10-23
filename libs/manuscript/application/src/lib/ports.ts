import type { Manuscript } from '@indie-writer-studio/manuscript-domain';

/** Persistence for manuscripts, one per Work. A manuscript cannot exist without its Work. */
export interface ManuscriptRepository {
  /**
   * The Work's manuscript: empty if it has none yet, and `undefined` if the Work itself does not
   * exist, so "no such Work" is never mistaken for "an empty book".
   */
  get(workId: string): Promise<Manuscript | undefined>;
  /**
   * Reads, changes and stores one Work's manuscript as a single step no other write can
   * interleave with, so concurrent changes all apply instead of the last one winning. `change`
   * receives the current manuscript (empty if none). If it throws, nothing is stored and the error
   * passes on. Throws `ManuscriptWorkNotFoundError`, storing nothing, if the Work does not exist.
   */
  update(workId: string, change: (current: Manuscript) => Manuscript): Promise<Manuscript>;
}

export interface IdGenerator {
  next(): string;
}

export const MANUSCRIPT_REPOSITORY = 'manuscript.ManuscriptRepository';
export const MANUSCRIPT_ID_GENERATOR = 'manuscript.IdGenerator';

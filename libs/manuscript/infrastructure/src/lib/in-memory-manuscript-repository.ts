import type { ManuscriptRepository } from '@indie-writer-studio/manuscript-application';
import type { Manuscript } from '@indie-writer-studio/manuscript-domain';

const copy = (manuscript: Manuscript): Manuscript => structuredClone(manuscript);

/** Hands back copies, so a caller cannot change what is stored. */
export class InMemoryManuscriptRepository implements ManuscriptRepository {
  private readonly manuscripts = new Map<string, Manuscript>();

  async get(workId: string): Promise<Manuscript | undefined> {
    const manuscript = this.manuscripts.get(workId);
    return manuscript === undefined ? undefined : copy(manuscript);
  }

  /** No `await` between the read and the write, so nothing can interleave. */
  async update(
    workId: string,
    change: (current: Manuscript | undefined) => Manuscript,
  ): Promise<Manuscript> {
    const stored = this.manuscripts.get(workId);
    const next = copy(change(stored === undefined ? undefined : copy(stored)));
    this.manuscripts.set(workId, next);
    return copy(next);
  }

  async remove(workId: string): Promise<boolean> {
    return this.manuscripts.delete(workId);
  }
}

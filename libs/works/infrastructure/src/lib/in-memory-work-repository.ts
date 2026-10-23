import type { WorkRepository } from '@indie-writer-studio/works-application';
import type { Work } from '@indie-writer-studio/works-domain';

const copy = (work: Work): Work => structuredClone(work);

/** Insertion-ordered, and hands back copies so a caller cannot change what is stored. */
export class InMemoryWorkRepository implements WorkRepository {
  private readonly works = new Map<string, Work>();

  async get(id: string): Promise<Work | undefined> {
    const work = this.works.get(id);
    return work === undefined ? undefined : copy(work);
  }

  async list(): Promise<readonly Work[]> {
    return [...this.works.values()].map(copy);
  }

  async save(work: Work): Promise<void> {
    this.works.set(work.id, copy(work));
  }

  /** No `await` between the read and the write, so nothing can interleave. */
  async update(id: string, change: (work: Work) => Work): Promise<Work | undefined> {
    const current = this.works.get(id);
    if (current === undefined) return undefined;
    const next = copy(change(copy(current)));
    this.works.set(id, next);
    return copy(next);
  }

  async remove(id: string): Promise<boolean> {
    return this.works.delete(id);
  }
}

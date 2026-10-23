import { describe, expect, it } from 'vitest';
import { createWork, type Work } from '@indie-writer-studio/works-domain';
import type { WorkRepository } from '@indie-writer-studio/works-application';

const at = '2026-11-01T10:00:00.000Z';
export const sample = (id: string, title = id): Work => createWork(id, { title }, at);

/** What every WorkRepository adapter promises, run against each adapter. */
export function workRepositoryContract(name: string, make: () => Promise<WorkRepository>): void {
  describe(`${name} satisfies the WorkRepository contract`, () => {
    it('returns undefined for a work it does not hold', async () => {
      expect(await (await make()).get('nope')).toBeUndefined();
    });

    it('saves a work and reads it back equal', async () => {
      const repo = await make();
      await repo.save(sample('w1', 'Salt'));
      expect(await repo.get('w1')).toEqual(sample('w1', 'Salt'));
    });

    it('lists works in the order they were first saved', async () => {
      const repo = await make();
      for (const id of ['c', 'a', 'b']) await repo.save(sample(id));
      expect((await repo.list()).map((w) => w.id)).toEqual(['c', 'a', 'b']);
    });

    it('replaces a saved work in place, keeping its position', async () => {
      const repo = await make();
      for (const id of ['a', 'b']) await repo.save(sample(id));
      await repo.save({ ...sample('a'), title: 'Renamed' });
      expect((await repo.list()).map((w) => [w.id, w.title])).toEqual([
        ['a', 'Renamed'],
        ['b', 'b'],
      ]);
    });

    it('removes a work and says whether there was one', async () => {
      const repo = await make();
      await repo.save(sample('a'));
      expect(await repo.remove('a')).toBe(true);
      expect(await repo.remove('a')).toBe(false);
      expect(await repo.list()).toEqual([]);
    });

    it('hands back copies, so a caller cannot change what is stored', async () => {
      const repo = await make();
      await repo.save(sample('a', 'Original'));
      const read = (await repo.get('a')) as { title: string };
      read.title = 'Mutated';
      expect((await repo.get('a'))?.title).toBe('Original');
    });
  });
}

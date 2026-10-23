import { addNode, emptyManuscript, type Manuscript } from '@indie-writer-studio/manuscript-domain';
import type { ManuscriptRepository } from '@indie-writer-studio/manuscript-application';
import { describe, expect, it } from 'vitest';

const at = '2026-11-01T10:00:00.000Z';
export const sample = (workId: string, ...titles: string[]): Manuscript =>
  titles.reduce(
    (manuscript, title, i) =>
      addNode(manuscript, { id: `${workId}-n${i}`, kind: 'chapter', title }, at),
    emptyManuscript(workId, at),
  );

/** What every ManuscriptRepository adapter promises, run against each adapter. */
export function manuscriptRepositoryContract(
  name: string,
  make: () => Promise<ManuscriptRepository>,
): void {
  describe(`${name} satisfies the ManuscriptRepository contract`, () => {
    it('returns undefined for a work with no manuscript', async () => {
      expect(await (await make()).get('w1')).toBeUndefined();
    });

    it('creates a manuscript on update when there is none, and reads it back equal', async () => {
      const repo = await make();
      const stored = await repo.update('w1', (current) => {
        expect(current).toBeUndefined();
        return sample('w1', 'One');
      });
      expect(stored).toEqual(sample('w1', 'One'));
      expect(await repo.get('w1')).toEqual(sample('w1', 'One'));
    });

    it('hands the current manuscript to the change and stores what it returns', async () => {
      const repo = await make();
      await repo.update('w1', () => sample('w1', 'One'));
      await repo.update('w1', (current) => {
        expect(current?.main.map((n) => n.title)).toEqual(['One']);
        return sample('w1', 'One', 'Two');
      });
      expect((await repo.get('w1'))?.main.map((n) => n.title)).toEqual(['One', 'Two']);
    });

    it('keeps each work’s manuscript apart', async () => {
      const repo = await make();
      await repo.update('a', () => sample('a', 'A1'));
      await repo.update('b', () => sample('b', 'B1'));
      expect((await repo.get('a'))?.main.map((n) => n.title)).toEqual(['A1']);
      expect((await repo.get('b'))?.main.map((n) => n.title)).toEqual(['B1']);
    });

    it('stores nothing when the change throws, and passes the error on', async () => {
      const repo = await make();
      await repo.update('w1', () => sample('w1', 'Keep'));
      await expect(
        repo.update('w1', () => {
          throw new Error('refused');
        }),
      ).rejects.toThrow('refused');
      await expect(
        repo.update('fresh', () => {
          throw new Error('refused');
        }),
      ).rejects.toThrow('refused');
      expect((await repo.get('w1'))?.main[0]?.title).toBe('Keep');
      expect(await repo.get('fresh')).toBeUndefined();
    });

    it('applies every one of many concurrent updates', async () => {
      const repo = await make();
      await repo.update('w1', () => sample('w1'));
      await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          repo.update('w1', (current) =>
            addNode(
              current ?? emptyManuscript('w1', at),
              { id: `c${i}`, kind: 'chapter', title: `C${i}` },
              at,
            ),
          ),
        ),
      );
      expect((await repo.get('w1'))?.main).toHaveLength(12);
    });

    it('removes a manuscript and says whether there was one', async () => {
      const repo = await make();
      await repo.update('w1', () => sample('w1', 'One'));
      expect(await repo.remove('w1')).toBe(true);
      expect(await repo.remove('w1')).toBe(false);
      expect(await repo.get('w1')).toBeUndefined();
    });

    it('hands back copies, so a caller cannot change what is stored', async () => {
      const repo = await make();
      await repo.update('w1', () => sample('w1', 'Original'));
      const read = (await repo.get('w1')) as { main: { title: string }[] };
      read.main[0]!.title = 'Mutated';
      expect((await repo.get('w1'))?.main[0]?.title).toBe('Original');
    });
  });
}

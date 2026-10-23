import { describe, expect, it } from 'vitest';
import {
  addEdition,
  createWork,
  publishEdition,
  type Work,
} from '@indie-writer-studio/works-domain';
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

    it('updates a work in place and returns the new version', async () => {
      const repo = await make();
      await repo.save(sample('a', 'One'));
      const next = await repo.update('a', (work) => ({ ...work, title: 'Two' }));
      expect(next?.title).toBe('Two');
      expect((await repo.get('a'))?.title).toBe('Two');
    });

    it('answers undefined, and does not create anything, when updating a work that is not there', async () => {
      const repo = await make();
      let called = false;
      const result = await repo.update('nope', (work) => {
        called = true;
        return work;
      });
      expect(result).toBeUndefined();
      expect(called).toBe(false);
      expect(await repo.list()).toEqual([]);
    });

    it('stores nothing when the change throws, and passes the error on', async () => {
      const repo = await make();
      await repo.save(sample('a', 'Keep'));
      await expect(
        repo.update('a', () => {
          throw new Error('refused');
        }),
      ).rejects.toThrow('refused');
      expect((await repo.get('a'))?.title).toBe('Keep');
    });

    it('applies every one of many concurrent updates', async () => {
      const repo = await make();
      await repo.save(sample('a', 't'));
      await Promise.all(
        Array.from({ length: 12 }, () =>
          repo.update('a', (work) => ({ ...work, title: `${work.title}x` })),
        ),
      );
      expect((await repo.get('a'))?.title).toBe(`t${'x'.repeat(12)}`);
    });

    it('keeps every one of many concurrent saves', async () => {
      const repo = await make();
      await Promise.all(Array.from({ length: 12 }, (_, i) => repo.save(sample(`w${i}`))));
      expect(await repo.list()).toHaveLength(12);
    });

    it('round-trips every field, including editions with their optional fields', async () => {
      const repo = await make();
      let work = createWork(
        'w1',
        { title: 'Salt', subtitle: 'A Novel', synopsis: 'Two sisters.' },
        at,
      );
      work = addEdition(work, { label: 'First', notes: 'typo fixes' }, at);
      work = addEdition(work, {}, at);
      work = publishEdition(work, 1, '2026-11-02', at);
      await repo.save(work);
      expect(await repo.get('w1')).toEqual(work);
    });

    it('round-trips text that needs care: newlines, quotes, control characters, unicode, long', async () => {
      const repo = await make();
      for (const [i, synopsis] of [
        'line one\nline two\ttabbed\r\n',
        'with "quotes" and \\ backslashes',
        'control \u0001 \u007f characters',
        'unicode é 日本語 🙂',
        'x'.repeat(5000),
      ].entries()) {
        const work = createWork(`t${i}`, { title: `T${i}`, synopsis }, at);
        await repo.save(work);
        expect(await repo.get(`t${i}`)).toEqual(work);
      }
    });

    it('drops an edition that a replacing save no longer has', async () => {
      const repo = await make();
      const withEditions = addEdition(
        addEdition(createWork('w1', { title: 'Salt' }, at), {}, at),
        {},
        at,
      );
      await repo.save(withEditions);
      await repo.save({ ...withEditions, editions: withEditions.editions.slice(0, 1) });
      expect((await repo.get('w1'))?.editions.map((e) => e.number)).toEqual([1]);
    });

    it('keeps one work’s editions apart from another’s, with the same edition numbers', async () => {
      const repo = await make();
      await repo.save(addEdition(createWork('a', { title: 'A' }, at), { label: 'A first' }, at));
      await repo.save(addEdition(createWork('b', { title: 'B' }, at), { label: 'B first' }, at));
      expect((await repo.get('a'))?.editions.map((e) => e.label)).toEqual(['A first']);
      expect((await repo.get('b'))?.editions.map((e) => e.label)).toEqual(['B first']);
      await repo.remove('a');
      expect((await repo.get('b'))?.editions.map((e) => e.label)).toEqual(['B first']);
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

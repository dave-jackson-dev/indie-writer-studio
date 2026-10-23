import {
  ManuscriptWorkNotFoundError,
  type ManuscriptRepository,
} from '@indie-writer-studio/manuscript-application';
import { addNode, emptyManuscript, type Manuscript } from '@indie-writer-studio/manuscript-domain';
import { describe, expect, it } from 'vitest';

/** A manuscript with every kind, nesting and matter, built with the domain's own rules. */
export const richManuscript = (workId: string, prefix = workId): Manuscript => {
  let m = emptyManuscript(workId);
  const add = (id: string, kind: string, title: string, where: object = {}, body = '') => {
    m = addNode(m, { id: `${prefix}-${id}`, kind, title, body, ...where });
  };
  add('ded', 'chapter', 'Dedication', { matter: 'front' }, 'for you');
  add('p1', 'part', 'Part One', {}, 'The part opens.');
  add(
    'c1',
    'chapter',
    'The Crossing',
    { parentId: `${prefix}-p1` },
    '# Salt\n\nThe *first* line.\n  Indented.\n',
  );
  add('s1', 'scene', 'Dawn', { parentId: `${prefix}-c1` }, 'one two three');
  add('s2', 'scene', 'Noon', { parentId: `${prefix}-c1` }, 'four');
  add('c2', 'chapter', 'Why Salt Matters', {}, '');
  add(
    'x1',
    'section',
    'A short history',
    { parentId: `${prefix}-c2` },
    'quotes " and \\ and\ttabs',
  );
  add('x2', 'section', 'Roman salaries', { parentId: `${prefix}-x1` }, 'unicode é 日本語 🙂');
  add('ack', 'section', 'Acknowledgments', { matter: 'back' }, 'thanks');
  return m;
};

export interface ManuscriptRepositoryFixture {
  readonly repository: ManuscriptRepository;
  /** Creates a Work in the same database, as the works catalog would. */
  addWork(id: string): Promise<void>;
}

/** What every ManuscriptRepository adapter promises, run against each adapter. */
export function manuscriptRepositoryContract(
  name: string,
  make: () => Promise<ManuscriptRepositoryFixture>,
): void {
  describe(`${name} satisfies the ManuscriptRepository contract`, () => {
    it('answers undefined for a Work that does not exist', async () => {
      const { repository } = await make();
      expect(await repository.get('ghost')).toBeUndefined();
    });

    it('answers an empty manuscript for a Work that has none yet', async () => {
      const { repository, addWork } = await make();
      await addWork('w1');
      expect(await repository.get('w1')).toEqual(emptyManuscript('w1'));
    });

    it('refuses to change the manuscript of a Work that does not exist, and creates nothing', async () => {
      const { repository, addWork } = await make();
      await addWork('w1');
      await expect(
        repository.update('ghost', () => richManuscript('ghost')),
      ).rejects.toBeInstanceOf(ManuscriptWorkNotFoundError);
      expect(await repository.get('ghost')).toBeUndefined();
    });

    it('hands the change an empty manuscript when there is none, and stores what it returns', async () => {
      const { repository, addWork } = await make();
      await addWork('w1');
      const stored = await repository.update('w1', (current) => {
        expect(current).toEqual(emptyManuscript('w1'));
        return richManuscript('w1');
      });
      expect(stored).toEqual(richManuscript('w1'));
      expect(await repository.get('w1')).toEqual(richManuscript('w1'));
    });

    it('keeps order, nesting, matter, kind and text exactly', async () => {
      const { repository, addWork } = await make();
      await addWork('w1');
      await repository.update('w1', () => richManuscript('w1'));
      const read = await repository.get('w1');
      expect(read?.main.map((n) => [n.kind, n.title])).toEqual([
        ['part', 'Part One'],
        ['chapter', 'Why Salt Matters'],
      ]);
      expect(read?.main[0]?.children[0]?.children.map((n) => n.title)).toEqual(['Dawn', 'Noon']);
      expect(read?.main[1]?.children[0]?.children[0]?.body).toBe('unicode é 日本語 🙂');
      expect(read?.front[0]?.title).toBe('Dedication');
      expect(read?.back[0]?.title).toBe('Acknowledgments');
    });

    it('stores a change to one node and a reordering without duplicating or losing nodes', async () => {
      const { repository, addWork } = await make();
      await addWork('w1');
      await repository.update('w1', () => richManuscript('w1'));
      const changed = await repository.update('w1', (current) => ({
        ...current,
        main: [...current.main].reverse(),
      }));
      expect(changed.main.map((n) => n.title)).toEqual(['Why Salt Matters', 'Part One']);
      expect((await repository.get('w1'))?.main.map((n) => n.title)).toEqual([
        'Why Salt Matters',
        'Part One',
      ]);
      await repository.update('w1', () => emptyManuscript('w1'));
      expect(await repository.get('w1')).toEqual(emptyManuscript('w1'));
    });

    it('keeps each Work’s manuscript apart', async () => {
      const { repository, addWork } = await make();
      await addWork('a');
      await addWork('b');
      await repository.update('a', () => richManuscript('a'));
      await repository.update('b', () =>
        addNode(emptyManuscript('b'), { id: 'b-only', kind: 'chapter', title: 'B1' }),
      );
      expect((await repository.get('b'))?.main.map((n) => n.title)).toEqual(['B1']);
      expect((await repository.get('a'))?.main).toHaveLength(2);
    });

    it('stores nothing when the change throws, and passes the error on', async () => {
      const { repository, addWork } = await make();
      await addWork('w1');
      await repository.update('w1', () => richManuscript('w1'));
      await expect(
        repository.update('w1', () => {
          throw new Error('refused');
        }),
      ).rejects.toThrow('refused');
      expect(await repository.get('w1')).toEqual(richManuscript('w1'));
    });

    it('applies every one of many concurrent updates', async () => {
      const { repository, addWork } = await make();
      await addWork('w1');
      await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          repository.update('w1', (current) =>
            addNode(current, { id: `c${i}`, kind: 'chapter', title: `C${i}` }),
          ),
        ),
      );
      expect((await repository.get('w1'))?.main).toHaveLength(12);
    });
  });
}

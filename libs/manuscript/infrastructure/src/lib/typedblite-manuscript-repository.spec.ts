import { CascadeHooks, Database } from '@indie-writer-studio/typedblite';
import { addNode, emptyManuscript } from '@indie-writer-studio/manuscript-domain';
import { TypeDBLiteWorkRepository, WORKS_SCHEMA } from '@indie-writer-studio/works-infrastructure';
import { createWork } from '@indie-writer-studio/works-domain';
import { afterEach, describe, expect, it } from 'vitest';

import { manuscriptRepositoryContract, richManuscript } from './manuscript-repository.contract.js';
import { MANUSCRIPT_SCHEMA } from './manuscript.schema.js';
import { TypeDBLiteManuscriptRepository } from './typedblite-manuscript-repository.js';

const opened: Database[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((database) => database.close()));
});

const at = '2026-11-01T10:00:00.000Z';

/** Both components’ schemas in one database, as the application composes them. */
const openBoth = async () => {
  const database = await Database.open({ schemas: [WORKS_SCHEMA, MANUSCRIPT_SCHEMA] });
  opened.push(database);
  const hooks = new CascadeHooks();
  const works = new TypeDBLiteWorkRepository(database, hooks);
  const repository = new TypeDBLiteManuscriptRepository(database, hooks);
  return {
    database,
    hooks,
    works,
    repository,
    addWork: (id: string) => works.save(createWork(id, { title: `Work ${id}` }, at)),
  };
};

const count = (database: Database, type: string): Promise<number> =>
  database.read(
    async (session) => (await session.query(`match $x isa ${type}; select $x;`)).length,
  );

manuscriptRepositoryContract('TypeDBLiteManuscriptRepository', async () => {
  const { repository, addWork } = await openBoth();
  return { repository, addWork };
});

describe('TypeDBLiteManuscriptRepository integrity', () => {
  it('stores each node as its own entity, linked to its Work by a relation', async () => {
    const { database, repository, addWork } = await openBoth();
    await addWork('w1');
    await repository.update('w1', () => richManuscript('w1'));
    expect(await count(database, 'manuscript-node')).toBe(9);
    const linked = await database.read((session) =>
      session.query(
        'match $w isa work, has work-id "w1"; (work: $w, node: $n) isa manuscript-of; $n isa manuscript-node; select $n;',
      ),
    );
    expect(linked).toHaveLength(9);
  });

  it('refuses a manuscript for a Work that does not exist, and leaves no node behind', async () => {
    const { database, repository } = await openBoth();
    await expect(repository.update('ghost', () => richManuscript('ghost'))).rejects.toMatchObject({
      code: 'WORK_NOT_FOUND',
      exitCode: 5,
    });
    expect(await count(database, 'manuscript-node')).toBe(0);
  });

  it('never lets one node id belong to two Works', async () => {
    const { database, repository, addWork } = await openBoth();
    await addWork('a');
    await addWork('b');
    await repository.update('a', () => richManuscript('a', 'shared'));
    await expect(repository.update('b', () => richManuscript('b', 'shared'))).rejects.toThrow(
      /unique|violated/i,
    );
    expect(await repository.get('b')).toEqual(emptyManuscript('b'));
    expect(await count(database, 'manuscript-node')).toBe(9);
  });

  it('removes the nodes a change drops, with their subtrees, and leaves no orphan entity', async () => {
    const { database, repository, addWork } = await openBoth();
    await addWork('w1');
    await repository.update('w1', () => richManuscript('w1'));
    await repository.update('w1', (current) => ({ ...current, main: current.main.slice(1) }));
    // "Part One" held "The Crossing", "Dawn" and "Noon": four nodes gone.
    expect(await count(database, 'manuscript-node')).toBe(5);
  });

  it('rewrites only what changed: an edit to one node leaves the others’ rows alone', async () => {
    const { database, repository, addWork } = await openBoth();
    await addWork('w1');
    await repository.update('w1', () => richManuscript('w1'));
    const before = await database.read((s) =>
      s.query('match $n isa manuscript-node, has node-id $i, has node-title $t; select $i, $t;'),
    );
    await repository.update('w1', (current) => ({
      ...current,
      front: [{ ...(current.front[0] as (typeof current.front)[number]), body: 'changed' }],
    }));
    const after = await database.read((s) =>
      s.query('match $n isa manuscript-node, has node-id $i, has node-title $t; select $i, $t;'),
    );
    expect(after).toHaveLength(before.length);
    expect((await repository.get('w1'))?.front[0]?.body).toBe('changed');
  });

  it('removes a Work’s whole manuscript when the Work is removed, in the same transaction', async () => {
    const { database, repository, works, addWork } = await openBoth();
    await addWork('a');
    await addWork('b');
    await repository.update('a', () => richManuscript('a'));
    await repository.update('b', () => richManuscript('b'));
    expect(await works.remove('a')).toBe(true);
    expect(await count(database, 'manuscript-node')).toBe(9);
    expect(await repository.get('a')).toBeUndefined();
    expect((await repository.get('b'))?.main).toHaveLength(2);
  });

  it('keeps the Work, its editions and its manuscript when removing the Work fails part-way', async () => {
    const { database, hooks, repository, works, addWork } = await openBoth();
    await addWork('a');
    await repository.update('a', () => richManuscript('a'));
    hooks.register('work', async () => {
      throw new Error('a later dependent refused');
    });
    await expect(works.remove('a')).rejects.toThrow('a later dependent refused');
    expect(await count(database, 'work')).toBe(1);
    expect(await count(database, 'manuscript-node')).toBe(9);
  });

  it('adds a node to an existing manuscript with the next free position among its siblings', async () => {
    const { repository, addWork } = await openBoth();
    await addWork('w1');
    await repository.update('w1', (c) => addNode(c, { id: 'a', kind: 'chapter', title: 'A' }));
    await repository.update('w1', (c) =>
      addNode(c, { id: 'b', kind: 'chapter', title: 'B', position: 0 }),
    );
    expect((await repository.get('w1'))?.main.map((n) => n.title)).toEqual(['B', 'A']);
  });
});

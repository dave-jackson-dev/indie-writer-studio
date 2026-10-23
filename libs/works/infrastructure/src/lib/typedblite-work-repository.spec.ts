import { CascadeHooks, Database } from '@indie-writer-studio/typedblite';
import { addEdition, createWork } from '@indie-writer-studio/works-domain';
import { afterEach, describe, expect, it } from 'vitest';

import { TypeDBLiteWorkRepository } from './typedblite-work-repository.js';
import { sample, workRepositoryContract } from './work-repository.contract.js';
import { WORKS_SCHEMA } from './works.schema.js';

const opened: Database[] = [];
afterEach(async () => {
  await Promise.all(opened.splice(0).map((database) => database.close()));
});

const openWorks = async () => {
  const database = await Database.open({ schemas: [WORKS_SCHEMA] });
  opened.push(database);
  const hooks = new CascadeHooks();
  return { database, hooks, repository: new TypeDBLiteWorkRepository(database, hooks) };
};

const count = (database: Database, type: string): Promise<number> =>
  database.read(
    async (session) => (await session.query(`match $x isa ${type}; select $x;`)).length,
  );

workRepositoryContract('TypeDBLiteWorkRepository', async () => (await openWorks()).repository);

const at = '2026-11-01T10:00:00.000Z';

describe('TypeDBLiteWorkRepository integrity', () => {
  it('stores each work and each edition as its own entity, linked by a relation', async () => {
    const { database, repository } = await openWorks();
    await repository.save(
      addEdition(addEdition(createWork('w1', { title: 'Salt' }, at), {}, at), {}, at),
    );
    expect(await count(database, 'work')).toBe(1);
    expect(await count(database, 'edition')).toBe(2);
    const linked = await database.read((session) =>
      session.query(
        'match $w isa work, has work-id "w1"; (owner: $w, edition: $e) isa work-edition; $e isa edition; select $e;',
      ),
    );
    expect(linked).toHaveLength(2);
  });

  it('never holds two works with one id: saving again replaces, and the database refuses a duplicate', async () => {
    const { database, repository } = await openWorks();
    await repository.save(sample('w1', 'One'));
    await repository.save(sample('w1', 'Two'));
    expect((await repository.list()).map((w) => w.title)).toEqual(['Two']);
    await expect(
      database.write((session) => session.execute('insert $w isa work, has work-id "w1";')),
    ).rejects.toThrow(/unique|violated/i);
  });

  it('refuses two editions with one number on one work', async () => {
    const { database, repository } = await openWorks();
    await repository.save(addEdition(createWork('w1', { title: 'Salt' }, at), {}, at));
    await expect(
      database.write((session) =>
        session.execute('insert $e isa edition, has edition-key "w1::1";'),
      ),
    ).rejects.toThrow(/unique|violated/i);
  });

  it('removes a work together with its editions and leaves nothing behind', async () => {
    const { database, repository } = await openWorks();
    await repository.save(addEdition(createWork('w1', { title: 'Salt' }, at), {}, at));
    await repository.save(addEdition(createWork('w2', { title: 'Glass' }, at), {}, at));
    expect(await repository.remove('w1')).toBe(true);
    expect(await count(database, 'work')).toBe(1);
    expect(await count(database, 'edition')).toBe(1);
  });

  it('runs the cascade hooks for the work inside the same transaction as its removal', async () => {
    const { database, hooks, repository } = await openWorks();
    const seen: string[] = [];
    hooks.register('work', async (id, session) => {
      seen.push(id);
      const inside = await session.query('match $w isa work, has work-id $i; select $i;');
      seen.push(`still has ${inside.length} work(s)`);
    });
    await repository.save(sample('w1'));
    await repository.remove('w1');
    expect(seen).toEqual(['w1', 'still has 1 work(s)']);
    expect(await count(database, 'work')).toBe(0);
  });

  it('keeps the work and its editions when a cascade hook refuses', async () => {
    const { database, hooks, repository } = await openWorks();
    hooks.register('work', async () => {
      throw new Error('a dependent refused');
    });
    await repository.save(addEdition(createWork('w1', { title: 'Salt' }, at), {}, at));
    await expect(repository.remove('w1')).rejects.toThrow('a dependent refused');
    expect(await count(database, 'work')).toBe(1);
    expect(await count(database, 'edition')).toBe(1);
  });

  it('runs no hooks when there was no such work', async () => {
    const { hooks, repository } = await openWorks();
    let ran = false;
    hooks.register('work', async () => void (ran = true));
    expect(await repository.remove('nope')).toBe(false);
    expect(ran).toBe(false);
  });

  it('leaves a work exactly as it was when an update’s change throws midway', async () => {
    const { repository } = await openWorks();
    await repository.save(addEdition(createWork('w1', { title: 'Salt' }, at), {}, at));
    const before = await repository.get('w1');
    await expect(
      repository.update('w1', (work) => {
        void work;
        throw new Error('refused');
      }),
    ).rejects.toThrow('refused');
    expect(await repository.get('w1')).toEqual(before);
  });
});

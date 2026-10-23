import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { Database } from './database.js';
import { decode, encode } from './literals.js';

const COUNTER =
  'define attribute slot, value string; attribute total, value integer; entity counter, owns slot @key, owns total;';
const NOTES = 'define attribute note-id, value string; entity note, owns note-id @key;';

const opened: Database[] = [];
const dirs: string[] = [];
const open = async (options: Parameters<typeof Database.open>[0]) => {
  const database = await Database.open(options);
  opened.push(database);
  return database;
};
const scratch = async () => {
  const dir = await mkdtemp(join(tmpdir(), 'typedblite-db-'));
  dirs.push(dir);
  return dir;
};
afterEach(async () => {
  await Promise.all(opened.splice(0).map((database) => database.close()));
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const total = async (database: Database): Promise<number> =>
  database.read(async (session) => {
    const rows = await session.query(
      'match $c isa counter, has slot "c", has total $t; select $t;',
    );
    return Number(rows[0]?.['t']);
  });

describe('Database', () => {
  it('defines every schema it is given, in order, so a later one can refer to an earlier one', async () => {
    const database = await open({
      schemas: [
        'define attribute owner-id, value string; entity owner, owns owner-id @key, plays owns-item:owner;',
        'define attribute item-id, value string; entity item, owns item-id @key, plays owns-item:item; relation owns-item, relates owner, relates item;',
      ],
    });
    await database.write(async (session) => {
      await session.execute('insert $o isa owner, has owner-id "o1";');
      await session.execute('insert $i isa item, has item-id "i1";');
      await session.execute(
        'match $o isa owner, has owner-id "o1"; $i isa item, has item-id "i1"; insert (owner: $o, item: $i) isa owns-item;',
      );
    });
    const rows = await database.read((session) =>
      session.query(
        'match $o isa owner, has owner-id "o1"; (owner: $o, item: $i) isa owns-item; $i has item-id $n; select $n;',
      ),
    );
    expect(rows.map((row) => row['n'])).toEqual(['i1']);
  });

  it('hands back plain values, not wrappers', async () => {
    const database = await open({ schemas: [NOTES] });
    await database.write((session) =>
      session.execute(`insert $n isa note, has note-id ${encode('é')};`),
    );
    const rows = await database.read((session) =>
      session.query('match $n isa note, has note-id $i; select $i;'),
    );
    expect(decode(rows[0]?.['i'])).toBe('é');
  });

  it('rolls a write back completely when it throws, and passes the error on', async () => {
    const database = await open({ schemas: [NOTES] });
    await expect(
      database.write(async (session) => {
        await session.execute('insert $n isa note, has note-id "a";');
        await session.execute('insert $n isa note, has note-id "b";');
        throw new Error('refused');
      }),
    ).rejects.toThrow('refused');
    expect(
      await database.read((session) =>
        session.query('match $n isa note, has note-id $i; select $i;'),
      ),
    ).toEqual([]);
  });

  it('rolls a write back when the engine refuses part of it (a duplicate key)', async () => {
    const database = await open({ schemas: [NOTES] });
    await database.write((session) => session.execute('insert $n isa note, has note-id "a";'));
    await expect(
      database.write(async (session) => {
        await session.execute('insert $n isa note, has note-id "b";');
        await session.execute('insert $n isa note, has note-id "a";');
      }),
    ).rejects.toThrow(/unique|violated/i);
    const rows = await database.read((session) =>
      session.query('match $n isa note, has note-id $i; select $i;'),
    );
    expect(rows.map((row) => row['i'])).toEqual(['a']);
  });

  it('serialises writes: many concurrent read-modify-write steps all apply', async () => {
    const database = await open({ schemas: [COUNTER] });
    await database.write((session) =>
      session.execute('insert $c isa counter, has slot "c", has total 0;'),
    );
    await Promise.all(
      Array.from({ length: 25 }, () =>
        database.write(async (session) => {
          const rows = await session.query(
            'match $c isa counter, has slot "c", has total $t; select $t;',
          );
          const next = Number(rows[0]?.['t']) + 1;
          await sleep(1);
          await session.execute('match $c isa counter, has slot "c"; delete $c;');
          await session.execute(`insert $c isa counter, has slot "c", has total ${next};`);
        }),
      ),
    );
    expect(await total(database)).toBe(25);
  });

  it('does not let a read see a write that is still in flight', async () => {
    const database = await open({ schemas: [NOTES] });
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const writing = database.write(async (session) => {
      await session.execute('insert $n isa note, has note-id "pending";');
      await held;
      throw new Error('abandoned');
    });
    await sleep(5);
    let seen: readonly unknown[] | undefined;
    const reading = database
      .read((session) => session.query('match $n isa note, has note-id $i; select $i;'))
      .then((rows) => (seen = rows));
    await sleep(10);
    expect(seen).toBeUndefined();
    release();
    await expect(writing).rejects.toThrow('abandoned');
    await reading;
    expect(seen).toEqual([]);
  });

  it('keeps its data in a file across a close and reopen, without defining the schema twice', async () => {
    const location = join(await scratch(), 'data.db');
    const first = await Database.open({ location, schemas: [NOTES] });
    await first.write((session) => session.execute('insert $n isa note, has note-id "kept";'));
    await first.close();
    const second = await open({ location, schemas: [NOTES] });
    const rows = await second.read((session) =>
      session.query('match $n isa note, has note-id $i; select $i;'),
    );
    expect(rows.map((row) => row['i'])).toEqual(['kept']);
  });

  it('creates the directory a file database lives in', async () => {
    const location = join(await scratch(), 'nested', 'deeper', 'data.db');
    const database = await open({ location, schemas: [NOTES] });
    await database.write((session) => session.execute('insert $n isa note, has note-id "a";'));
    expect(
      await database.read((session) =>
        session.query('match $n isa note, has note-id $i; select $i;'),
      ),
    ).toHaveLength(1);
  });

  it('refuses work after it is closed', async () => {
    const database = await Database.open({ schemas: [NOTES] });
    await database.close();
    await expect(
      database.read((session) => session.query('match $n isa note; select $n;')),
    ).rejects.toThrow(/closed/i);
    await expect(database.write(async () => undefined)).rejects.toThrow(/closed/i);
  });
});

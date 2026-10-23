import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { JsonFileWorkRepository } from './json-file-work-repository.js';
import { sample, workRepositoryContract } from './work-repository.contract.js';

const dirs: string[] = [];
const scratch = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'works-json-'));
  dirs.push(dir);
  return dir;
};
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

workRepositoryContract(
  'JsonFileWorkRepository',
  async () => new JsonFileWorkRepository(await scratch()),
);

describe('JsonFileWorkRepository', () => {
  it('keeps works across instances over the same directory', async () => {
    const dir = await scratch();
    await new JsonFileWorkRepository(dir).save(sample('w1', 'Salt'));
    expect(await new JsonFileWorkRepository(dir).get('w1')).toEqual(sample('w1', 'Salt'));
  });

  it('creates the data directory when it does not exist', async () => {
    const dir = join(await scratch(), 'nested', 'data');
    await new JsonFileWorkRepository(dir).save(sample('w1'));
    expect(await readdir(dir)).toContain('works.json');
  });

  it('starts empty when nothing has been saved', async () => {
    expect(await new JsonFileWorkRepository(await scratch()).list()).toEqual([]);
  });

  it('writes readable JSON and leaves no temporary files behind', async () => {
    const dir = await scratch();
    await new JsonFileWorkRepository(dir).save(sample('w1', 'Salt'));
    expect(await readdir(dir)).toEqual(['works.json']);
    const text = await readFile(join(dir, 'works.json'), 'utf8');
    expect(JSON.parse(text)).toMatchObject({ works: [{ id: 'w1', title: 'Salt' }] });
    expect(text).toContain('\n');
  });

  it('refuses a corrupt file by naming it, rather than starting empty and overwriting it', async () => {
    const dir = await scratch();
    await writeFile(join(dir, 'works.json'), '{ not json');
    const repo = new JsonFileWorkRepository(dir);
    await expect(repo.list()).rejects.toThrow(/works\.json/);
    await expect(repo.save(sample('w1'))).rejects.toThrow(/works\.json/);
    expect(await readFile(join(dir, 'works.json'), 'utf8')).toBe('{ not json');
  });

  it('loses no update when two instances over one directory write at once (two processes)', async () => {
    const dir = await scratch();
    const a = new JsonFileWorkRepository(dir);
    const b = new JsonFileWorkRepository(dir);
    await a.save(sample('shared', 't'));
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        (i % 2 === 0 ? a : b).update('shared', (work) => ({ ...work, title: `${work.title}x` })),
      ),
    );
    expect((await a.get('shared'))?.title).toBe(`t${'x'.repeat(10)}`);
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? a : b).save(sample(`w${i}`))),
    );
    expect(await a.list()).toHaveLength(11);
  });

  it('leaves no lock or temporary file behind after writes, or after a refused change', async () => {
    const dir = await scratch();
    const repo = new JsonFileWorkRepository(dir);
    await repo.save(sample('a'));
    await repo.update('a', (work) => work);
    await expect(
      repo.update('a', () => {
        throw new Error('no');
      }),
    ).rejects.toThrow();
    expect(await readdir(dir)).toEqual(['works.json']);
  });

  it('breaks a lock left by a crashed process once it is stale', async () => {
    const dir = await scratch();
    const lock = join(dir, 'works.lock');
    await writeFile(lock, '99999');
    const old = new Date(Date.now() - 120_000);
    await utimes(lock, old, old);
    await new JsonFileWorkRepository(dir).save(sample('a'));
    expect(await readdir(dir)).toEqual(['works.json']);
  });

  it.each([
    ['null', 'null'],
    ['an object without works', '{}'],
    ['a null entry', '{"works":[null]}'],
    ['an entry without an id', '{"works":[{"title":"x","status":"draft","editions":[]}]}'],
    ['an entry without editions', '{"works":[{"id":"a","title":"x","status":"draft"}]}'],
    ['an unknown status', '{"works":[{"id":"a","title":"x","status":"nope","editions":[]}]}'],
  ])('refuses a file that holds %s, naming the file', async (_name, content) => {
    const dir = await scratch();
    await writeFile(join(dir, 'works.json'), content);
    const repo = new JsonFileWorkRepository(dir);
    await expect(repo.list()).rejects.toThrow(/works\.json.*left untouched/);
    await expect(repo.get('a')).rejects.toThrow(/works\.json/);
    expect(await readFile(join(dir, 'works.json'), 'utf8')).toBe(content);
  });
});

import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
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
});

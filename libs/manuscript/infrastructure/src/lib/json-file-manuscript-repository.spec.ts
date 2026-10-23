import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { JsonFileManuscriptRepository } from './json-file-manuscript-repository.js';
import { manuscriptRepositoryContract, sample } from './manuscript-repository.contract.js';

const dirs: string[] = [];
const scratch = async (): Promise<string> => {
  const dir = await mkdtemp(join(tmpdir(), 'manuscript-json-'));
  dirs.push(dir);
  return dir;
};
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

manuscriptRepositoryContract(
  'JsonFileManuscriptRepository',
  async () => new JsonFileManuscriptRepository(await scratch()),
);

describe('JsonFileManuscriptRepository', () => {
  it('keeps manuscripts across instances over the same directory', async () => {
    const dir = await scratch();
    await new JsonFileManuscriptRepository(dir).update('w1', () => sample('w1', 'One'));
    expect(await new JsonFileManuscriptRepository(dir).get('w1')).toEqual(sample('w1', 'One'));
  });

  it('writes one readable file per work under manuscripts/, and nothing else is left behind', async () => {
    const dir = await scratch();
    await new JsonFileManuscriptRepository(dir).update('w1', () => sample('w1', 'One'));
    await new JsonFileManuscriptRepository(dir).update('w2', () => sample('w2', 'Two'));
    expect((await readdir(join(dir, 'manuscripts'))).sort()).toEqual(['w1.json', 'w2.json']);
    const text = await readFile(join(dir, 'manuscripts', 'w1.json'), 'utf8');
    expect(JSON.parse(text)).toMatchObject({ manuscript: { workId: 'w1' } });
    expect(text).toContain('\n');
  });

  it('refuses a work id that could name a file outside the data directory', async () => {
    const repo = new JsonFileManuscriptRepository(await scratch());
    for (const id of ['../x', 'a/b', '..', '']) {
      await expect(repo.get(id)).rejects.toThrow(/work id/i);
      await expect(repo.update(id, () => sample('w1'))).rejects.toThrow(/work id/i);
      await expect(repo.remove(id)).rejects.toThrow(/work id/i);
    }
  });

  it('loses no update when two instances over one directory write at once (two processes)', async () => {
    const dir = await scratch();
    const a = new JsonFileManuscriptRepository(dir);
    const b = new JsonFileManuscriptRepository(dir);
    await a.update('w1', () => sample('w1'));
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        (i % 2 === 0 ? a : b).update('w1', (current) => ({
          ...(current as ReturnType<typeof sample>),
          main: [
            ...(current?.main ?? []),
            { id: `c${i}`, kind: 'chapter' as const, title: `C${i}`, body: '', children: [] },
          ],
        })),
      ),
    );
    expect((await a.get('w1'))?.main).toHaveLength(10);
    expect((await readdir(join(dir, 'manuscripts'))).sort()).toEqual(['w1.json']);
  });

  it('refuses a corrupt or wrongly shaped file by naming it, and leaves it untouched', async () => {
    const dir = await scratch();
    await mkdir(join(dir, 'manuscripts'));
    const file = join(dir, 'manuscripts', 'w1.json');
    const repo = new JsonFileManuscriptRepository(dir);
    for (const content of [
      '{ not json',
      'null',
      '{}',
      '{"manuscript":null}',
      '{"manuscript":{"workId":"w1","front":[],"main":[null],"back":[],"updatedAt":"x"}}',
      '{"manuscript":{"workId":"w1","front":[],"main":[{"id":"a","kind":"act","title":"t","body":"","children":[]}],"back":[],"updatedAt":"x"}}',
      '{"manuscript":{"workId":"other","front":[],"main":[],"back":[],"updatedAt":"x"}}',
    ]) {
      await writeFile(file, content);
      await expect(repo.get('w1')).rejects.toThrow(/w1\.json.*left untouched/);
      await expect(repo.update('w1', () => sample('w1'))).rejects.toThrow(/w1\.json/);
      expect(await readFile(file, 'utf8')).toBe(content);
    }
  });
});

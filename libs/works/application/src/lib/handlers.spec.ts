import { describe, expect, it } from 'vitest';
import type { Work } from '@indie-writer-studio/works-domain';

import { WorkNotFoundError } from './errors.js';
import {
  AddEditionHandler,
  AddWorkHandler,
  GetWorkHandler,
  ListEditionsHandler,
  ListWorksHandler,
  PublishEditionHandler,
  RemoveWorkHandler,
  UpdateWorkHandler,
} from './handlers.js';
import type { Clock, IdGenerator, WorkRepository } from './ports.js';
import {
  AddEditionCommand,
  AddWorkCommand,
  GetWorkQuery,
  ListEditionsQuery,
  ListWorksQuery,
  PublishEditionCommand,
  RemoveWorkCommand,
  UpdateWorkCommand,
} from './requests.js';

class MemoryRepo implements WorkRepository {
  readonly works = new Map<string, Work>();
  async get(id: string) {
    return this.works.get(id);
  }
  async list() {
    return [...this.works.values()];
  }
  async save(work: Work) {
    this.works.set(work.id, work);
  }
  async remove(id: string) {
    return this.works.delete(id);
  }
  async update(id: string, change: (work: Work) => Work) {
    const current = this.works.get(id);
    if (!current) return undefined;
    const next = change(current);
    this.works.set(id, next);
    return next;
  }
}

const sequence = (): IdGenerator => {
  let n = 0;
  return { next: () => `w${++n}` };
};
const clock = (...times: string[]): Clock => {
  let i = 0;
  return { now: () => times[Math.min(i++, times.length - 1)] as string };
};

const T1 = '2026-11-01T10:00:00.000Z';
const T2 = '2026-11-02T10:00:00.000Z';

const setup = () => {
  const repo = new MemoryRepo();
  const ids = sequence();
  const time = clock(T1, T2);
  return {
    repo,
    add: new AddWorkHandler(repo, ids, time),
    get: new GetWorkHandler(repo),
    list: new ListWorksHandler(repo),
    update: new UpdateWorkHandler(repo, time),
    remove: new RemoveWorkHandler(repo),
    addEdition: new AddEditionHandler(repo, time),
    publish: new PublishEditionHandler(repo, time),
    editions: new ListEditionsHandler(repo),
  };
};

describe('works handlers', () => {
  it('adds a work with a generated id and saves it', async () => {
    const s = setup();
    const { work } = await s.add.execute(new AddWorkCommand('Salt Road', 'A Novel', undefined));
    expect(work).toMatchObject({
      id: 'w1',
      title: 'Salt Road',
      subtitle: 'A Novel',
      status: 'draft',
    });
    expect(await s.repo.get('w1')).toEqual(work);
  });

  it('turns a domain refusal into a coded error with the usage exit code', async () => {
    const s = setup();
    await expect(
      s.add.execute(new AddWorkCommand('  ', undefined, undefined)),
    ).rejects.toMatchObject({
      code: 'INVALID_WORK',
      exitCode: 2,
    });
    expect(await s.repo.list()).toEqual([]);
  });

  it('gets a work and refuses an unknown id with WORK_NOT_FOUND (exit 5)', async () => {
    const s = setup();
    const { work } = await s.add.execute(new AddWorkCommand('Salt', undefined, undefined));
    expect((await s.get.execute(new GetWorkQuery(work.id))).work).toEqual(work);
    await expect(s.get.execute(new GetWorkQuery('nope'))).rejects.toBeInstanceOf(WorkNotFoundError);
    await expect(s.get.execute(new GetWorkQuery('nope'))).rejects.toMatchObject({
      code: 'WORK_NOT_FOUND',
      exitCode: 5,
    });
  });

  it('lists works in the repository order and filters by status', async () => {
    const s = setup();
    await s.add.execute(new AddWorkCommand('B', undefined, undefined));
    const { work } = await s.add.execute(new AddWorkCommand('A', undefined, undefined));
    await s.update.execute(new UpdateWorkCommand(work.id, { status: 'complete' }));
    expect((await s.list.execute(new ListWorksQuery(undefined))).works.map((w) => w.title)).toEqual(
      ['B', 'A'],
    );
    expect(
      (await s.list.execute(new ListWorksQuery('complete'))).works.map((w) => w.title),
    ).toEqual(['A']);
  });

  it('refuses to filter by a status that does not exist', async () => {
    const s = setup();
    await expect(s.list.execute(new ListWorksQuery('abandoned'))).rejects.toMatchObject({
      code: 'INVALID_WORK',
      exitCode: 2,
    });
  });

  it('updates a work and refuses an unknown id', async () => {
    const s = setup();
    const { work } = await s.add.execute(new AddWorkCommand('Salt', undefined, undefined));
    const updated = await s.update.execute(new UpdateWorkCommand(work.id, { title: 'Salt Road' }));
    expect(updated.work.title).toBe('Salt Road');
    expect((await s.repo.get(work.id))?.title).toBe('Salt Road');
    await expect(
      s.update.execute(new UpdateWorkCommand('nope', { title: 'x' })),
    ).rejects.toMatchObject({
      code: 'WORK_NOT_FOUND',
    });
  });

  it('removes a work, and refuses to remove one twice', async () => {
    const s = setup();
    const { work } = await s.add.execute(new AddWorkCommand('Salt', undefined, undefined));
    expect(await s.remove.execute(new RemoveWorkCommand(work.id))).toEqual({ removed: work.id });
    expect(await s.repo.list()).toEqual([]);
    await expect(s.remove.execute(new RemoveWorkCommand(work.id))).rejects.toMatchObject({
      code: 'WORK_NOT_FOUND',
    });
  });

  it('adds editions and returns the new edition with its work', async () => {
    const s = setup();
    const { work } = await s.add.execute(new AddWorkCommand('Salt', undefined, undefined));
    const result = await s.addEdition.execute(new AddEditionCommand(work.id, 'First', undefined));
    expect(result.edition).toMatchObject({ number: 1, label: 'First', status: 'draft' });
    expect(result.work.editions).toHaveLength(1);
    expect((await s.repo.get(work.id))?.editions).toHaveLength(1);
    await expect(
      s.addEdition.execute(new AddEditionCommand('nope', undefined, undefined)),
    ).rejects.toMatchObject({ code: 'WORK_NOT_FOUND' });
  });

  it('publishes an edition and maps domain refusals to their exit codes', async () => {
    const s = setup();
    const { work } = await s.add.execute(new AddWorkCommand('Salt', undefined, undefined));
    await s.addEdition.execute(new AddEditionCommand(work.id, undefined, undefined));
    const published = await s.publish.execute(new PublishEditionCommand(work.id, 1, '2026-11-02'));
    expect(published.edition).toMatchObject({ status: 'published', publishedOn: '2026-11-02' });
    await expect(
      s.publish.execute(new PublishEditionCommand(work.id, 1, '2026-12-01')),
    ).rejects.toMatchObject({ code: 'EDITION_CONFLICT', exitCode: 3 });
    await expect(
      s.publish.execute(new PublishEditionCommand(work.id, 9, '2026-12-01')),
    ).rejects.toMatchObject({ code: 'EDITION_NOT_FOUND', exitCode: 5 });
    await expect(
      s.publish.execute(new PublishEditionCommand(work.id, 1, 'tomorrow')),
    ).rejects.toMatchObject({ code: 'INVALID_EDITION', exitCode: 2 });
  });

  it('does not save when a domain rule refuses', async () => {
    const s = setup();
    const { work } = await s.add.execute(new AddWorkCommand('Salt', undefined, undefined));
    await s.addEdition.execute(new AddEditionCommand(work.id, undefined, undefined));
    const before = await s.repo.get(work.id);
    await expect(
      s.publish.execute(new PublishEditionCommand(work.id, 1, 'tomorrow')),
    ).rejects.toBeDefined();
    expect(await s.repo.get(work.id)).toEqual(before);
  });

  it('lists the editions of a work in number order', async () => {
    const s = setup();
    const { work } = await s.add.execute(new AddWorkCommand('Salt', undefined, undefined));
    await s.addEdition.execute(new AddEditionCommand(work.id, undefined, undefined));
    await s.addEdition.execute(new AddEditionCommand(work.id, undefined, undefined));
    const { editions } = await s.editions.execute(new ListEditionsQuery(work.id));
    expect(editions.map((e) => e.number)).toEqual([1, 2]);
    await expect(s.editions.execute(new ListEditionsQuery('nope'))).rejects.toMatchObject({
      code: 'WORK_NOT_FOUND',
    });
  });

  it('numbers editions correctly when two are added to the same work at once', async () => {
    const s = setup();
    const { work } = await s.add.execute(new AddWorkCommand('Salt', undefined, undefined));
    await Promise.all([
      s.addEdition.execute(new AddEditionCommand(work.id, undefined, undefined)),
      s.addEdition.execute(new AddEditionCommand(work.id, undefined, undefined)),
      s.addEdition.execute(new AddEditionCommand(work.id, undefined, undefined)),
    ]);
    expect((await s.repo.get(work.id))?.editions.map((e) => e.number)).toEqual([1, 2, 3]);
  });

  it('leaves exactly one edition published when two are published at once', async () => {
    const s = setup();
    const { work } = await s.add.execute(new AddWorkCommand('Salt', undefined, undefined));
    await s.addEdition.execute(new AddEditionCommand(work.id, undefined, undefined));
    await s.addEdition.execute(new AddEditionCommand(work.id, undefined, undefined));
    await Promise.all([
      s.publish.execute(new PublishEditionCommand(work.id, 1, '2026-11-02')),
      s.publish.execute(new PublishEditionCommand(work.id, 2, '2026-11-03')),
    ]);
    const editions = (await s.repo.get(work.id))?.editions ?? [];
    expect(editions.filter((e) => e.status === 'published')).toHaveLength(1);
  });

  it('does not bring a removed work back when a late update arrives', async () => {
    const s = setup();
    const { work } = await s.add.execute(new AddWorkCommand('Salt', undefined, undefined));
    await s.remove.execute(new RemoveWorkCommand(work.id));
    await expect(
      s.update.execute(new UpdateWorkCommand(work.id, { title: 'x' })),
    ).rejects.toMatchObject({
      code: 'WORK_NOT_FOUND',
    });
    await expect(
      s.addEdition.execute(new AddEditionCommand(work.id, undefined, undefined)),
    ).rejects.toMatchObject({ code: 'WORK_NOT_FOUND' });
    expect(await s.repo.list()).toEqual([]);
  });
});

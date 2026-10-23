import {
  emptyManuscript,
  parseWorkId,
  type Manuscript,
} from '@indie-writer-studio/manuscript-domain';
import { describe, expect, it } from 'vitest';

import { ManuscriptWorkNotFoundError } from './errors.js';
import {
  AddNodeHandler,
  GetNodeHandler,
  GetOutlineHandler,
  MoveNodeHandler,
  RemoveNodeHandler,
  UpdateNodeHandler,
} from './handlers.js';
import type { IdGenerator, ManuscriptRepository } from './ports.js';
import {
  AddNodeCommand,
  GetNodeQuery,
  GetOutlineQuery,
  MoveNodeCommand,
  RemoveNodeCommand,
  UpdateNodeCommand,
} from './requests.js';

/**
 * A repository that honours the port: a manuscript exists for a Work that exists, `get` answers
 * undefined for a Work that does not, and `update` refuses one. `checkIds` makes it validate the
 * work id before anything else, as the database-backed adapter does.
 */
class FakeRepo implements ManuscriptRepository {
  readonly store = new Map<string, Manuscript>();
  constructor(
    readonly works: Set<string>,
    private readonly checkIds = false,
  ) {}
  async get(workId: string) {
    if (this.checkIds) parseWorkId(workId);
    if (!this.works.has(workId)) return undefined;
    return this.store.get(workId) ?? emptyManuscript(workId);
  }
  async update(workId: string, change: (current: Manuscript) => Manuscript) {
    if (this.checkIds) parseWorkId(workId);
    if (!this.works.has(workId)) throw new ManuscriptWorkNotFoundError(workId);
    const next = change(this.store.get(workId) ?? emptyManuscript(workId));
    this.store.set(workId, next);
    return next;
  }
}

const ids = (): IdGenerator => {
  let n = 0;
  return { next: () => `n${++n}` };
};

const W = 'w1';

const setup = (works: string[] = [W], checkIds = false) => {
  const repo = new FakeRepo(new Set(works), checkIds);
  const generator = ids();
  return {
    repo,
    add: new AddNodeHandler(repo, generator),
    get: new GetNodeHandler(repo),
    outline: new GetOutlineHandler(repo),
    update: new UpdateNodeHandler(repo),
    move: new MoveNodeHandler(repo),
    remove: new RemoveNodeHandler(repo),
  };
};

const addChapter = (
  s: ReturnType<typeof setup>,
  title: string,
  extra: Partial<AddNodeCommand> = {},
) =>
  s.add.execute(
    Object.assign(
      new AddNodeCommand(W, 'chapter', title, undefined, undefined, undefined, undefined),
      extra,
    ),
  );

describe('manuscript handlers', () => {
  it('creates the manuscript on the first node and returns the node with a generated id', async () => {
    const s = setup();
    const { node } = await addChapter(s, 'One');
    expect(node).toMatchObject({ id: 'n1', kind: 'chapter', title: 'One', body: '', children: [] });
    expect((await s.repo.get(W))?.main).toHaveLength(1);
  });

  it('turns a domain refusal into a coded error with the right exit code, storing nothing', async () => {
    const s = setup();
    await expect(addChapter(s, '  ')).rejects.toMatchObject({ code: 'INVALID_NODE', exitCode: 2 });
    await expect(addChapter(s, 'X', { matter: 'front', kind: 'part' })).rejects.toMatchObject({
      code: 'INVALID_PLACEMENT',
      exitCode: 2,
    });
    expect(s.repo.store.size).toBe(0);
  });

  it('refuses a Work that does not exist as WORK_NOT_FOUND (exit 5) on every operation', async () => {
    const s = setup([]);
    const expected = { code: 'WORK_NOT_FOUND', exitCode: 5 };
    await expect(addChapter(s, 'Ghost')).rejects.toMatchObject(expected);
    await expect(s.outline.execute(new GetOutlineQuery(W))).rejects.toMatchObject(expected);
    await expect(s.get.execute(new GetNodeQuery(W, 'n1'))).rejects.toMatchObject(expected);
    await expect(
      s.update.execute(new UpdateNodeCommand(W, 'n1', { title: 'x' })),
    ).rejects.toMatchObject(expected);
    await expect(
      s.move.execute(new MoveNodeCommand(W, 'n1', { matter: 'back' })),
    ).rejects.toMatchObject(expected);
    await expect(s.remove.execute(new RemoveNodeCommand(W, 'n1'))).rejects.toMatchObject(expected);
    expect(s.repo.store.size).toBe(0);
  });

  it('an error class for it exists with the same code', () => {
    expect(new ManuscriptWorkNotFoundError('w9')).toMatchObject({
      code: 'WORK_NOT_FOUND',
      exitCode: 5,
    });
  });

  it('maps an unsafe work id to INVALID_WORK_ID on every operation, even when the repository rejects it first', async () => {
    const s = setup([W], true);
    const expected = { code: 'INVALID_WORK_ID', exitCode: 2 };
    await expect(
      s.add.execute(
        new AddNodeCommand('../x', 'chapter', 'T', undefined, undefined, undefined, undefined),
      ),
    ).rejects.toMatchObject(expected);
    await expect(s.outline.execute(new GetOutlineQuery('../x'))).rejects.toMatchObject(expected);
    await expect(s.get.execute(new GetNodeQuery('../x', 'n1'))).rejects.toMatchObject(expected);
    await expect(
      s.update.execute(new UpdateNodeCommand('../x', 'n1', { title: 'x' })),
    ).rejects.toMatchObject(expected);
    await expect(
      s.move.execute(new MoveNodeCommand('../x', 'n1', { matter: 'back' })),
    ).rejects.toMatchObject(expected);
    await expect(s.remove.execute(new RemoveNodeCommand('../x', 'n1'))).rejects.toMatchObject(
      expected,
    );
  });

  it('answers an empty outline for a Work that has no manuscript yet', async () => {
    const s = setup();
    expect(await s.outline.execute(new GetOutlineQuery(W))).toEqual({
      front: [],
      main: [],
      back: [],
      totalWords: 0,
    });
  });

  it('returns the outline with word counts and without the text', async () => {
    const s = setup();
    const { node } = await addChapter(s, 'One');
    await s.update.execute(new UpdateNodeCommand(W, node.id, { body: 'one two three' }));
    const outline = await s.outline.execute(new GetOutlineQuery(W));
    expect(outline.totalWords).toBe(3);
    expect(outline.main[0]).toMatchObject({ title: 'One', words: 3, totalWords: 3 });
    expect(JSON.stringify(outline)).not.toContain('one two three');
  });

  it('gets one node with its text, and refuses an unknown node', async () => {
    const s = setup();
    const { node } = await addChapter(s, 'One');
    await s.update.execute(new UpdateNodeCommand(W, node.id, { body: 'hello' }));
    expect((await s.get.execute(new GetNodeQuery(W, node.id))).node.body).toBe('hello');
    await expect(s.get.execute(new GetNodeQuery(W, 'nope'))).rejects.toMatchObject({
      code: 'NODE_NOT_FOUND',
      exitCode: 5,
    });
  });

  it('updates, moves and removes nodes', async () => {
    const s = setup();
    const a = (await addChapter(s, 'A')).node;
    const b = (await addChapter(s, 'B')).node;
    expect(
      (await s.update.execute(new UpdateNodeCommand(W, a.id, { title: 'Alpha' }))).node.title,
    ).toBe('Alpha');
    const moved = await s.move.execute(
      new MoveNodeCommand(W, b.id, { matter: 'main', position: 0 }),
    );
    expect(moved.node.title).toBe('B');
    expect((await s.outline.execute(new GetOutlineQuery(W))).main.map((n) => n.title)).toEqual([
      'B',
      'Alpha',
    ]);
    expect(await s.remove.execute(new RemoveNodeCommand(W, a.id))).toEqual({ removed: a.id });
    expect((await s.outline.execute(new GetOutlineQuery(W))).main.map((n) => n.title)).toEqual([
      'B',
    ]);
  });

  it('answers NODE_NOT_FOUND for an unknown node when the Work has no manuscript yet', async () => {
    const s = setup();
    await expect(
      s.update.execute(new UpdateNodeCommand(W, 'n1', { title: 'x' })),
    ).rejects.toMatchObject({
      code: 'NODE_NOT_FOUND',
    });
    await expect(
      s.move.execute(new MoveNodeCommand(W, 'n1', { matter: 'back' })),
    ).rejects.toMatchObject({
      code: 'NODE_NOT_FOUND',
    });
    await expect(s.remove.execute(new RemoveNodeCommand(W, 'n1'))).rejects.toMatchObject({
      code: 'NODE_NOT_FOUND',
    });
    expect(s.repo.store.size).toBe(0);
  });

  it('keeps the manuscript as it was when a change is refused', async () => {
    const s = setup();
    const { node } = await addChapter(s, 'One');
    const before = await s.repo.get(W);
    await expect(
      s.move.execute(new MoveNodeCommand(W, node.id, { parentId: node.id })),
    ).rejects.toMatchObject({ code: 'INVALID_PLACEMENT' });
    expect(await s.repo.get(W)).toEqual(before);
  });

  it('numbers concurrent additions without losing any', async () => {
    const s = setup();
    await Promise.all([addChapter(s, 'A'), addChapter(s, 'B'), addChapter(s, 'C')]);
    expect((await s.repo.get(W))?.main).toHaveLength(3);
  });
});

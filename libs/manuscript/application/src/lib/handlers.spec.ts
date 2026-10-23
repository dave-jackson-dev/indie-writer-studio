import type { Manuscript } from '@indie-writer-studio/manuscript-domain';
import { describe, expect, it } from 'vitest';

import {
  AddNodeHandler,
  GetNodeHandler,
  GetOutlineHandler,
  MoveNodeHandler,
  RemoveNodeHandler,
  UpdateNodeHandler,
} from './handlers.js';
import type { Clock, IdGenerator, ManuscriptRepository } from './ports.js';
import {
  AddNodeCommand,
  GetNodeQuery,
  GetOutlineQuery,
  MoveNodeCommand,
  RemoveNodeCommand,
  UpdateNodeCommand,
} from './requests.js';

class MemoryRepo implements ManuscriptRepository {
  readonly store = new Map<string, Manuscript>();
  async get(workId: string) {
    return this.store.get(workId);
  }
  async update(workId: string, change: (current: Manuscript | undefined) => Manuscript) {
    const next = change(this.store.get(workId));
    this.store.set(workId, next);
    return next;
  }
  async remove(workId: string) {
    return this.store.delete(workId);
  }
}

const ids = (): IdGenerator => {
  let n = 0;
  return { next: () => `n${++n}` };
};
const clock: Clock = { now: () => '2026-11-01T10:00:00.000Z' };

const setup = () => {
  const repo = new MemoryRepo();
  const generator = ids();
  return {
    repo,
    add: new AddNodeHandler(repo, generator, clock),
    get: new GetNodeHandler(repo),
    outline: new GetOutlineHandler(repo),
    update: new UpdateNodeHandler(repo, clock),
    move: new MoveNodeHandler(repo, clock),
    remove: new RemoveNodeHandler(repo, clock),
  };
};

const W = 'w1';
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
    expect(await s.repo.get(W)).toBeUndefined();
  });

  it('refuses an unsafe work id with INVALID_WORK_ID', async () => {
    const s = setup();
    await expect(
      s.add.execute(
        new AddNodeCommand('../x', 'chapter', 'T', undefined, undefined, undefined, undefined),
      ),
    ).rejects.toMatchObject({ code: 'INVALID_WORK_ID', exitCode: 2 });
    await expect(s.outline.execute(new GetOutlineQuery('../x'))).rejects.toMatchObject({
      code: 'INVALID_WORK_ID',
    });
  });

  it('answers an empty outline for a work with no manuscript, without storing one', async () => {
    const s = setup();
    expect(await s.outline.execute(new GetOutlineQuery(W))).toEqual({
      front: [],
      main: [],
      back: [],
      totalWords: 0,
    });
    expect(s.repo.store.size).toBe(0);
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

  it('gets one node with its text, and refuses an unknown node or manuscript', async () => {
    const s = setup();
    const { node } = await addChapter(s, 'One');
    await s.update.execute(new UpdateNodeCommand(W, node.id, { body: 'hello' }));
    expect((await s.get.execute(new GetNodeQuery(W, node.id))).node.body).toBe('hello');
    await expect(s.get.execute(new GetNodeQuery(W, 'nope'))).rejects.toMatchObject({
      code: 'NODE_NOT_FOUND',
      exitCode: 5,
    });
    await expect(s.get.execute(new GetNodeQuery('other', 'n1'))).rejects.toMatchObject({
      code: 'NODE_NOT_FOUND',
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

  it('does not create a manuscript when updating, moving or removing on a work that has none', async () => {
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

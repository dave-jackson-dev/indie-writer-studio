import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CqrsToolRuntime } from '@indie-writer-studio/cqrs-tool-runtime';
import { createManuscriptToolOperations } from '@indie-writer-studio/manuscript-application';
import { NestFactory } from '@nestjs/core';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { afterEach, describe, expect, it } from 'vitest';

import { ManuscriptModule } from './manuscript.module.js';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

const boot = async (dataDir?: string) => {
  const context = await NestFactory.createApplicationContext(
    ManuscriptModule.register({ dataDir }),
    {
      logger: false,
    },
  );
  closers.push(() => context.close());
  return new CqrsToolRuntime({
    commandBus: context.get(CommandBus),
    queryBus: context.get(QueryBus),
    operations: createManuscriptToolOperations(),
  });
};

describe('ManuscriptModule', () => {
  it('serves every manuscript operation through the shared runtime', async () => {
    const runtime = await boot();
    const added = await runtime.dispatch('manuscript.node.add', {
      'work-id': 'w1',
      kind: 'chapter',
      title: 'One',
    });
    expect(added).toMatchObject({ status: 'success', data: { node: { title: 'One' } } });
    const id = (added.data as { node: { id: string } }).node.id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const scene = await runtime.dispatch('manuscript.node.add', {
      'work-id': 'w1',
      kind: 'scene',
      title: 'Dawn',
      'parent-id': id,
      body: 'one two',
    });
    expect(scene.status).toBe('success');
    const outline = await runtime.dispatch('manuscript.outline', { 'work-id': 'w1' });
    expect((outline.data as { totalWords: number }).totalWords).toBe(2);
    const refused = await runtime.dispatch('manuscript.node.add', {
      'work-id': 'w1',
      kind: 'scene',
      title: 'Loose',
    });
    expect(refused).toMatchObject({
      status: 'error',
      exitCode: 2,
      error: { code: 'INVALID_PLACEMENT' },
    });
  });

  it('keeps manuscripts across a restart when given a data directory', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'manuscript-module-'));
    try {
      const first = await boot(dir);
      await first.dispatch('manuscript.node.add', {
        'work-id': 'w1',
        kind: 'chapter',
        title: 'One',
      });
      await closers.splice(0)[0]?.();
      const second = await boot(dir);
      const outline = await second.dispatch('manuscript.outline', { 'work-id': 'w1' });
      expect((outline.data as { main: { title: string }[] }).main.map((n) => n.title)).toEqual([
        'One',
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps nothing across a restart without a data directory', async () => {
    const first = await boot();
    await first.dispatch('manuscript.node.add', {
      'work-id': 'w1',
      kind: 'chapter',
      title: 'Gone',
    });
    await closers.splice(0)[0]?.();
    const second = await boot();
    expect(
      (
        (await second.dispatch('manuscript.outline', { 'work-id': 'w1' })).data as {
          main: unknown[];
        }
      ).main,
    ).toEqual([]);
  });
});

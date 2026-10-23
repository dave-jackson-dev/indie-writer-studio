import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CqrsToolRuntime } from '@indie-writer-studio/cqrs-tool-runtime';
import { TypeDBLiteModule } from '@indie-writer-studio/typedblite';
import { createWorksToolOperations } from '@indie-writer-studio/works-application';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { afterEach, describe, expect, it } from 'vitest';

import { WORKS_SCHEMA } from './works.schema.js';
import { WorksModule } from './works.module.js';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

const boot = async (location?: string) => {
  @Module({
    imports: [
      TypeDBLiteModule.register({ location, schemas: [WORKS_SCHEMA] }),
      WorksModule.register(),
    ],
  })
  class Root {}
  const context = await NestFactory.createApplicationContext(Root, { logger: false });
  closers.push(() => context.close());
  return new CqrsToolRuntime({
    commandBus: context.get(CommandBus),
    queryBus: context.get(QueryBus),
    operations: createWorksToolOperations(),
  });
};

describe('WorksModule', () => {
  it('serves every works operation through the shared runtime', async () => {
    const runtime = await boot();
    const added = await runtime.dispatch('works.work.add', { title: 'Salt Road' });
    expect(added).toMatchObject({ status: 'success', data: { work: { title: 'Salt Road' } } });
    const id = (added.data as { work: { id: string } }).work.id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const edition = await runtime.dispatch('works.edition.add', { 'work-id': id });
    expect(edition.status).toBe('success');
    const listed = await runtime.dispatch('works.work.list', {});
    expect((listed.data as { works: unknown[] }).works).toHaveLength(1);
  });

  it('stamps works with the real clock', async () => {
    const runtime = await boot();
    const before = Date.now();
    const added = await runtime.dispatch('works.work.add', { title: 'T' });
    const stamp = Date.parse((added.data as { work: { createdAt: string } }).work.createdAt);
    expect(stamp).toBeGreaterThanOrEqual(before - 1);
    expect(stamp).toBeLessThanOrEqual(Date.now() + 1);
  });

  it('keeps works across a restart when the database is a file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'works-module-'));
    try {
      const location = join(dir, 'indie-writer.db');
      const first = await boot(location);
      await first.dispatch('works.work.add', { title: 'Salt Road' });
      await closers.splice(0)[0]?.();
      const second = await boot(location);
      const listed = await second.dispatch('works.work.list', {});
      expect((listed.data as { works: { title: string }[] }).works.map((w) => w.title)).toEqual([
        'Salt Road',
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps nothing across a restart when the database is in memory', async () => {
    const first = await boot();
    await first.dispatch('works.work.add', { title: 'Gone' });
    await closers.splice(0)[0]?.();
    const second = await boot();
    expect(
      ((await second.dispatch('works.work.list', {})).data as { works: unknown[] }).works,
    ).toEqual([]);
  });
});

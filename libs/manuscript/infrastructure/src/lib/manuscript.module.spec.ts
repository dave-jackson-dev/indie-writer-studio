import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { CqrsToolRuntime } from '@indie-writer-studio/cqrs-tool-runtime';
import { createManuscriptToolOperations } from '@indie-writer-studio/manuscript-application';
import { TypeDBLiteModule } from '@indie-writer-studio/typedblite';
import { createWorksToolOperations } from '@indie-writer-studio/works-application';
import { WORKS_SCHEMA, WorksModule } from '@indie-writer-studio/works-infrastructure';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { afterEach, describe, expect, it } from 'vitest';

import { MANUSCRIPT_SCHEMA } from './manuscript.schema.js';
import { ManuscriptModule } from './manuscript.module.js';

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

/** Works and manuscripts composed over one database, as the application does. */
const boot = async (location?: string) => {
  const database = TypeDBLiteModule.register({
    location,
    schemas: [WORKS_SCHEMA, MANUSCRIPT_SCHEMA],
  });
  @Module({ imports: [database, WorksModule.register(), ManuscriptModule.register()] })
  class Root {}
  const context = await NestFactory.createApplicationContext(Root, { logger: false });
  closers.push(() => context.close());
  return new CqrsToolRuntime({
    commandBus: context.get(CommandBus),
    queryBus: context.get(QueryBus),
    operations: [...createWorksToolOperations(), ...createManuscriptToolOperations()],
  });
};

const workId = async (runtime: CqrsToolRuntime, title = 'Salt Road'): Promise<string> =>
  ((await runtime.dispatch('works.work.add', { title })).data as { work: { id: string } }).work.id;

describe('ManuscriptModule', () => {
  it('serves every manuscript operation through the shared runtime, for an existing Work', async () => {
    const runtime = await boot();
    const id = await workId(runtime);
    const added = await runtime.dispatch('manuscript.node.add', {
      'work-id': id,
      kind: 'chapter',
      title: 'One',
    });
    expect(added).toMatchObject({ status: 'success', data: { node: { title: 'One' } } });
    const nodeId = (added.data as { node: { id: string } }).node.id;
    expect(nodeId).toMatch(/^[0-9a-f-]{36}$/);
    const scene = await runtime.dispatch('manuscript.node.add', {
      'work-id': id,
      kind: 'scene',
      title: 'Dawn',
      'parent-id': nodeId,
      body: 'one two',
    });
    expect(scene.status).toBe('success');
    const outline = await runtime.dispatch('manuscript.outline', { 'work-id': id });
    expect((outline.data as { totalWords: number }).totalWords).toBe(2);
    const refused = await runtime.dispatch('manuscript.node.add', {
      'work-id': id,
      kind: 'scene',
      title: 'Loose',
    });
    expect(refused).toMatchObject({
      status: 'error',
      exitCode: 2,
      error: { code: 'INVALID_PLACEMENT' },
    });
  });

  it('refuses a manuscript for a Work that does not exist', async () => {
    const runtime = await boot();
    const refused = await runtime.dispatch('manuscript.node.add', {
      'work-id': 'no-such-work',
      kind: 'chapter',
      title: 'Ghost',
    });
    expect(refused).toMatchObject({
      status: 'error',
      exitCode: 5,
      error: { code: 'WORK_NOT_FOUND' },
    });
    const outline = await runtime.dispatch('manuscript.outline', { 'work-id': 'no-such-work' });
    expect(outline).toMatchObject({ status: 'error', error: { code: 'WORK_NOT_FOUND' } });
  });

  it('removes the manuscript when its Work is removed', async () => {
    const runtime = await boot();
    const id = await workId(runtime);
    await runtime.dispatch('manuscript.node.add', { 'work-id': id, kind: 'chapter', title: 'One' });
    expect((await runtime.dispatch('works.work.remove', { id })).status).toBe('success');
    expect(await runtime.dispatch('manuscript.outline', { 'work-id': id })).toMatchObject({
      status: 'error',
      error: { code: 'WORK_NOT_FOUND' },
    });
  });

  it('keeps manuscripts across a restart when the database is a file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'manuscript-module-'));
    try {
      const location = join(dir, 'indie-writer.db');
      const first = await boot(location);
      const id = await workId(first);
      await first.dispatch('manuscript.node.add', { 'work-id': id, kind: 'chapter', title: 'One' });
      await closers.splice(0)[0]?.();
      const second = await boot(location);
      const outline = await second.dispatch('manuscript.outline', { 'work-id': id });
      expect((outline.data as { main: { title: string }[] }).main.map((n) => n.title)).toEqual([
        'One',
      ]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

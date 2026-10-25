import { Injectable } from '@angular/core';
import { requireBridge, runOperation, type IndieWriterBridge } from '../bridge/operations';
import type { EditionDto, WorkDto } from '../catalog/catalog';
import type { OutlineDto } from '../outline/outline-tree';

/** Every operation the window uses, by name, so the components speak in the author's terms. */
@Injectable({ providedIn: 'root' })
export class WriterApi {
  private bridge: IndieWriterBridge | undefined;

  private run<T>(operation: string, input?: Record<string, unknown>): Promise<T> {
    this.bridge ??= requireBridge(globalThis as { indieWriter?: IndieWriterBridge });
    return runOperation<T>(this.bridge, operation, input);
  }

  async listWorks(status?: string): Promise<WorkDto[]> {
    const input = status ? { status } : undefined;
    return (await this.run<{ works: WorkDto[] }>('works.work.list', input)).works;
  }

  addWork(input: { title: string; subtitle?: string; synopsis?: string }): Promise<unknown> {
    return this.run('works.work.add', input);
  }

  updateWork(id: string, changes: Record<string, string>): Promise<unknown> {
    return this.run('works.work.update', { id, ...changes });
  }

  removeWork(id: string): Promise<unknown> {
    return this.run('works.work.remove', { id });
  }

  async listEditions(workId: string): Promise<EditionDto[]> {
    return (await this.run<{ editions: EditionDto[] }>('works.edition.list', { 'work-id': workId }))
      .editions;
  }

  addEdition(workId: string, label?: string, notes?: string): Promise<unknown> {
    return this.run('works.edition.add', {
      'work-id': workId,
      ...(label ? { label } : {}),
      ...(notes ? { notes } : {}),
    });
  }

  publishEdition(workId: string, number: number, publishedOn?: string): Promise<unknown> {
    return this.run('works.edition.publish', {
      'work-id': workId,
      number,
      ...(publishedOn ? { 'published-on': publishedOn } : {}),
    });
  }

  outline(workId: string): Promise<OutlineDto> {
    return this.run<OutlineDto>('manuscript.outline', { 'work-id': workId });
  }

  addNode(
    workId: string,
    input: { kind: string; title: string; parentId?: string },
  ): Promise<unknown> {
    return this.run('manuscript.node.add', {
      'work-id': workId,
      kind: input.kind,
      title: input.title,
      ...(input.parentId ? { 'parent-id': input.parentId } : {}),
    });
  }

  removeNode(workId: string, id: string): Promise<unknown> {
    return this.run('manuscript.node.remove', { 'work-id': workId, id });
  }
}

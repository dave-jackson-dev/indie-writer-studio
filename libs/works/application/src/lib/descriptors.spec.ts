import { assertNoUnknownInput, probeInput } from '@indie-writer-studio/cqrs-tool-runtime';
import { describe, expect, it } from 'vitest';

import { createWorksToolOperations } from './descriptors.js';
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

const operations = createWorksToolOperations();
const operation = (name: string) => {
  const found = operations.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`no operation ${name}`);
  return found;
};
const request = (name: string, input: Record<string, unknown>) => {
  const op = operation(name);
  return op.createRequest(op.validate ? op.validate(input) : input);
};

describe('works operations', () => {
  it('declares the catalog operations, commands and queries', () => {
    expect(operations.map((o) => [o.name, o.kind])).toEqual([
      ['works.work.add', 'command'],
      ['works.work.get', 'query'],
      ['works.work.list', 'query'],
      ['works.work.update', 'command'],
      ['works.work.remove', 'command'],
      ['works.edition.add', 'command'],
      ['works.edition.publish', 'command'],
      ['works.edition.list', 'query'],
    ]);
    for (const o of operations) expect(o.summary.length).toBeGreaterThan(10);
  });

  it('builds each request from kebab-case input', () => {
    expect(request('works.work.add', { title: 'T', subtitle: 'S' })).toEqual(
      new AddWorkCommand('T', 'S', undefined),
    );
    expect(request('works.work.get', { id: 'w1' })).toEqual(new GetWorkQuery('w1'));
    expect(request('works.work.list', {})).toEqual(new ListWorksQuery(undefined));
    expect(request('works.work.list', { status: 'draft' })).toEqual(new ListWorksQuery('draft'));
    expect(request('works.work.update', { id: 'w1', title: 'N', subtitle: '' })).toEqual(
      new UpdateWorkCommand('w1', { title: 'N', subtitle: '' }),
    );
    expect(request('works.work.remove', { id: 'w1' })).toEqual(new RemoveWorkCommand('w1'));
    expect(request('works.edition.add', { 'work-id': 'w1', label: 'L' })).toEqual(
      new AddEditionCommand('w1', 'L', undefined),
    );
    expect(
      request('works.edition.publish', {
        'work-id': 'w1',
        number: 2,
        'published-on': '2026-11-02',
      }),
    ).toEqual(new PublishEditionCommand('w1', 2, '2026-11-02'));
    expect(request('works.edition.list', { 'work-id': 'w1' })).toEqual(new ListEditionsQuery('w1'));
  });

  it('only sends the fields an update was given', () => {
    expect(request('works.work.update', { id: 'w1', status: 'complete' })).toEqual(
      new UpdateWorkCommand('w1', { status: 'complete' }),
    );
  });

  it.each([
    ['works.work.add', {}],
    ['works.work.add', { title: 5 }],
    ['works.work.get', {}],
    ['works.work.update', { title: 'x' }],
    ['works.edition.add', {}],
    ['works.edition.publish', { 'work-id': 'w1' }],
    ['works.edition.publish', { 'work-id': 'w1', number: '2' }],
    ['works.edition.publish', { 'work-id': 'w1', number: 1.5 }],
    ['works.edition.publish', { 'work-id': 'w1', number: 0 }],
  ])('refuses %s with %j as invalid input', (name, input) => {
    expect(() => request(name, input as Record<string, unknown>)).toThrow();
  });

  it('reads every key it documents, so the runtime never refuses one of them as unknown', () => {
    for (const op of operations) {
      const properties = op.inputSchema?.properties ?? {};
      const input = Object.fromEntries(
        Object.entries(properties).map(([key, schema]) => [
          key,
          schema.type === 'integer' ? 1 : (schema.enum?.[0] ?? 'x'),
        ]),
      );
      const probe = probeInput(input);
      op.validate?.(probe.input);
      expect(() => assertNoUnknownInput(op.name, input, probe), op.name).not.toThrow();
    }
  });

  it('leaves a key it does not read for the runtime to refuse by name', () => {
    const op = operation('works.work.add');
    const input = { title: 'T', bogus: 1 };
    const probe = probeInput(input);
    op.validate?.(probe.input);
    expect(() => assertNoUnknownInput(op.name, input, probe)).toThrow(/bogus/);
  });

  it('describes its input so OpenAPI can document it', () => {
    for (const o of operations) expect(o.inputSchema?.type).toBe('object');
  });
});

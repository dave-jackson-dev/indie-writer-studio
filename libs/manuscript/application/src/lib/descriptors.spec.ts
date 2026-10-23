import { assertNoUnknownInput, probeInput } from '@indie-writer-studio/cqrs-tool-runtime';
import { describe, expect, it } from 'vitest';

import { createManuscriptToolOperations } from './descriptors.js';
import {
  AddNodeCommand,
  GetNodeQuery,
  GetOutlineQuery,
  MoveNodeCommand,
  RemoveNodeCommand,
  UpdateNodeCommand,
} from './requests.js';

const operations = createManuscriptToolOperations();
const operation = (name: string) => {
  const found = operations.find((candidate) => candidate.name === name);
  if (!found) throw new Error(`no operation ${name}`);
  return found;
};
const request = (name: string, input: Record<string, unknown>) => {
  const op = operation(name);
  return op.createRequest(op.validate ? op.validate(input) : input);
};

describe('manuscript operations', () => {
  it('declares the manuscript operations, commands and queries', () => {
    expect(operations.map((o) => [o.name, o.kind])).toEqual([
      ['manuscript.node.add', 'command'],
      ['manuscript.node.get', 'query'],
      ['manuscript.outline', 'query'],
      ['manuscript.node.update', 'command'],
      ['manuscript.node.move', 'command'],
      ['manuscript.node.remove', 'command'],
    ]);
    for (const o of operations) expect(o.summary.length).toBeGreaterThan(10);
  });

  it('builds each request from kebab-case input', () => {
    expect(
      request('manuscript.node.add', {
        'work-id': 'w1',
        kind: 'scene',
        title: 'T',
        'parent-id': 'p',
        position: 0,
        body: 'b',
      }),
    ).toEqual(new AddNodeCommand('w1', 'scene', 'T', 'b', 'p', undefined, 0));
    expect(
      request('manuscript.node.add', {
        'work-id': 'w1',
        kind: 'chapter',
        title: 'T',
        matter: 'front',
      }),
    ).toEqual(new AddNodeCommand('w1', 'chapter', 'T', undefined, undefined, 'front', undefined));
    expect(request('manuscript.node.get', { 'work-id': 'w1', id: 'n1' })).toEqual(
      new GetNodeQuery('w1', 'n1'),
    );
    expect(request('manuscript.outline', { 'work-id': 'w1' })).toEqual(new GetOutlineQuery('w1'));
    expect(
      request('manuscript.node.update', { 'work-id': 'w1', id: 'n1', title: 'T', body: '' }),
    ).toEqual(new UpdateNodeCommand('w1', 'n1', { title: 'T', body: '' }));
    expect(
      request('manuscript.node.move', { 'work-id': 'w1', id: 'n1', 'parent-id': 'p', position: 2 }),
    ).toEqual(new MoveNodeCommand('w1', 'n1', { parentId: 'p', matter: undefined, position: 2 }));
    expect(request('manuscript.node.remove', { 'work-id': 'w1', id: 'n1' })).toEqual(
      new RemoveNodeCommand('w1', 'n1'),
    );
  });

  it('lets a blank title or body through, for the domain to refuse with its own code', () => {
    expect(() =>
      request('manuscript.node.add', { 'work-id': 'w1', kind: 'chapter', title: '   ' }),
    ).not.toThrow();
    expect(() =>
      request('manuscript.node.update', { 'work-id': 'w1', id: 'n', body: '' }),
    ).not.toThrow();
  });

  it.each([
    ['manuscript.node.add', {}],
    ['manuscript.node.add', { 'work-id': 'w1', title: 'T' }],
    ['manuscript.node.add', { 'work-id': 'w1', kind: 'chapter' }],
    ['manuscript.node.add', { 'work-id': 'w1', kind: 'chapter', title: 5 }],
    ['manuscript.node.add', { 'work-id': 'w1', kind: 'chapter', title: 'T', position: -1 }],
    ['manuscript.node.add', { 'work-id': 'w1', kind: 'chapter', title: 'T', position: 1.5 }],
    ['manuscript.node.add', { 'work-id': 'w1', kind: 'chapter', title: 'T', position: '1' }],
    ['manuscript.node.get', { 'work-id': 'w1' }],
    ['manuscript.outline', {}],
    ['manuscript.node.update', { 'work-id': 'w1' }],
    ['manuscript.node.move', { 'work-id': 'w1' }],
    ['manuscript.node.remove', { id: 'n1' }],
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

  it('describes its input so OpenAPI can document it', () => {
    for (const o of operations) expect(o.inputSchema?.type).toBe('object');
  });
});

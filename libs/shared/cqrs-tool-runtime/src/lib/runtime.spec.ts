import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  defineOperation,
  httpStatusForExitCode,
  TOOL_EXIT_CODES,
  type ToolBus,
  type ToolOperationDescriptor,
} from './contracts.js';
import { optionalStringList, requiredString } from './input.js';
import { CqrsToolRuntime, parseToolArguments } from './runtime.js';

const bus = (handler: (request: unknown) => unknown): ToolBus => ({
  execute: async (request) => handler(request),
});

const echo = defineOperation<{ text: string; tags?: string[] }>({
  name: 'demo.echo',
  summary: 'Echo the text',
  kind: 'query',
  validate: (input) => ({
    text: requiredString(input, 'text', 'demo.echo'),
    tags: optionalStringList(input, 'tags', 'demo.echo'),
  }),
  createRequest: (input) => ({ type: 'echo', ...input }),
});
const run: ToolOperationDescriptor = {
  name: 'demo.run',
  summary: 'A command',
  kind: 'command',
  createRequest: (input) => ({ type: 'run', ...input }),
};

const runtime = (handler: (request: unknown) => unknown = (request) => request) =>
  new CqrsToolRuntime({
    commandBus: bus(handler),
    queryBus: bus(handler),
    operations: [run, echo],
  });

describe('CqrsToolRuntime.dispatch', () => {
  it('wraps a result in a success envelope using the right bus for the kind', async () => {
    const seen: string[] = [];
    const r = new CqrsToolRuntime({
      commandBus: bus(() => (seen.push('command'), { ok: 1 })),
      queryBus: bus(() => (seen.push('query'), { ok: 2 })),
      operations: [run, echo],
    });
    const q = await r.dispatch('demo.echo', { text: 'hi' }, 'c1');
    const c = await r.dispatch('demo.run', {}, 'c2');
    expect(seen).toEqual(['query', 'command']);
    expect(q).toMatchObject({
      schemaVersion: '1.0.0',
      correlationId: 'c1',
      operation: 'demo.echo',
      kind: 'query',
      status: 'success',
      exitCode: 0,
      data: { ok: 2 },
    });
    expect(c.kind).toBe('command');
  });

  it('passes validated input to createRequest', async () => {
    const envelope = await runtime().dispatch('demo.echo', { text: 'hi', tags: 'a' });
    expect(envelope.data).toEqual({ type: 'echo', text: 'hi', tags: ['a'] });
  });

  it('answers an unknown operation as a usage error', async () => {
    expect(await runtime().dispatch('demo.nope')).toMatchObject({
      status: 'error',
      exitCode: TOOL_EXIT_CODES.usage,
      error: { code: 'UNKNOWN_OPERATION' },
    });
  });

  it('refuses unknown input keys by name and says what is accepted', async () => {
    const envelope = await runtime().dispatch('demo.echo', { text: 'hi', colour: 'red' });
    expect(envelope.error).toMatchObject({ code: 'INVALID_INPUT' });
    expect(envelope.error?.message).toContain("'colour'");
    expect(envelope.error?.message).toContain("'tags', 'text'");
  });

  it('prefers the missing-argument message over the unknown-key one', async () => {
    const envelope = await runtime().dispatch('demo.echo', { colour: 'red' });
    expect(envelope.error?.message).toContain("needs a non-empty string 'text'");
  });

  it.each([[null], ['text'], [7], [['a']]])(
    'refuses non-object input %j by name',
    async (value) => {
      const envelope = await runtime().dispatch('demo.echo', value as never);
      expect(envelope).toMatchObject({ status: 'error', error: { code: 'INVALID_INPUT' } });
    },
  );

  it('reports a stopped run as incomplete, exit 4, keeping its data', async () => {
    const envelope = await runtime(() => ({ complete: false, outcomes: ['a'] })).dispatch(
      'demo.run',
      {},
    );
    expect(envelope).toMatchObject({
      status: 'incomplete',
      exitCode: TOOL_EXIT_CODES.blocked,
      data: { complete: false, outcomes: ['a'] },
    });
  });

  it('does not treat an absent `complete` as a stop', async () => {
    expect((await runtime(() => ({ n: 1 })).dispatch('demo.run', {})).status).toBe('success');
    expect((await runtime(() => ({ complete: true })).dispatch('demo.run', {})).status).toBe(
      'success',
    );
  });

  it("keeps a domain error's own code, exit code and details", async () => {
    const failing = runtime(() => {
      throw Object.assign(new Error('nope'), {
        code: 'SOURCE_NOT_FOUND',
        exitCode: 5,
        details: { a: 1 },
      });
    });
    expect((await failing.dispatch('demo.run', {})).error).toEqual({
      code: 'SOURCE_NOT_FOUND',
      message: 'nope',
      details: { a: 1 },
    });
    expect((await failing.dispatch('demo.run', {})).exitCode).toBe(5);
  });

  it('reports an error without a code as HANDLER_FAILURE, exit 1', async () => {
    const failing = runtime(() => {
      throw new Error('boom');
    });
    expect(await failing.dispatch('demo.run', {})).toMatchObject({
      exitCode: 1,
      error: { code: 'HANDLER_FAILURE', message: 'boom' },
    });
  });

  it('refuses to register an operation twice', () => {
    expect(
      () =>
        new CqrsToolRuntime({
          commandBus: bus(() => 0),
          queryBus: bus(() => 0),
          operations: [run, run],
        }),
    ).toThrow(/more than once/);
  });
});

describe('help and completion', () => {
  it('lists operations sorted, in text and as an envelope', () => {
    const r = runtime();
    expect(r.help('indie-writer-studio')).toMatch(/Usage: indie-writer-studio[\s\S]*demo\.echo[\s\S]*demo\.run/);
    expect(r.helpEnvelope('h').data).toMatchObject({
      operations: [{ name: 'demo.echo' }, { name: 'demo.run' }],
    });
    expect(r.helpEnvelope('h', 'demo.run').data).toMatchObject({
      name: 'demo.run',
      kind: 'command',
    });
    expect(r.helpEnvelope('h', 'nope')).toMatchObject({
      status: 'error',
      error: { code: 'UNKNOWN_OPERATION' },
    });
  });

  it('completes operation names and flags', () => {
    const r = runtime();
    expect(r.completeReplLine('demo.e')).toEqual([['demo.echo']]);
    expect(r.completeReplLine('demo.echo --j')).toEqual([['--json', '--json-file']]);
    expect(r.completeReplLine('help demo.r')).toEqual([['demo.run']]);
    expect(r.completeReplLine('')[0]).toEqual(expect.arrayContaining(['help', 'exit', 'demo.run']));
  });
});

describe('parseToolArguments', () => {
  it('parses flags, bare flags and accumulates repeats', () => {
    expect(parseToolArguments(['op', '--a', '1', '--flag', '--x', 'p', '--x', 'q'])).toEqual({
      operation: 'op',
      input: { a: '1', flag: true, x: ['p', 'q'] },
    });
  });

  it('merges --json and --json-file through the same accumulate rule', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tool-args-'));
    const file = join(dir, 'in.json');
    writeFileSync(file, '﻿{"b": 2, "x": "from-file"}');
    expect(
      parseToolArguments(['op', '--json', '{"a":1,"x":"j"}', '--json-file', file]).input,
    ).toEqual({
      a: 1,
      b: 2,
      x: ['j', 'from-file'],
    });
  });

  it.each([
    [[], 'MISSING_OPERATION'],
    [['--x'], 'MISSING_OPERATION'],
    [['op', 'stray'], 'UNEXPECTED_ARGUMENT'],
    [['op', '--json'], 'MISSING_JSON'],
    [['op', '--json', '{bad'], 'INVALID_JSON'],
    [['op', '--json', '[1]'], 'INVALID_JSON'],
    [['op', '--json-file', '/no/such/file.json'], 'JSON_FILE_UNREADABLE'],
    [['op', '--a', '--a', '2'], 'INVALID_INPUT'],
  ])('rejects %j with %s', (args, code) => {
    expect(() => parseToolArguments(args)).toThrow(expect.objectContaining({ code }));
  });
});

describe('httpStatusForExitCode', () => {
  it.each([
    [0, 500],
    [1, 500],
    [2, 400],
    [3, 409],
    [4, 409],
    [5, 404],
    [10, 503],
  ])('exit %i is HTTP %i', (exit, status) => {
    expect(httpStatusForExitCode(exit)).toBe(status);
  });
});

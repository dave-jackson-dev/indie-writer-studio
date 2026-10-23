import { PassThrough } from 'node:stream';

import { describe, expect, it } from 'vitest';

import { defineOperation, type ToolIo } from './contracts.js';
import { requiredString } from './input.js';
import { CqrsToolRuntime } from './runtime.js';
import {
  formatEnvelope,
  runInteractiveRepl,
  runJsonLinesDriver,
  runOneShot,
  tokenizeLine,
} from './transports.js';

const runtime = new CqrsToolRuntime({
  commandBus: { execute: async () => ({}) },
  queryBus: { execute: async (request) => ({ got: request }) },
  operations: [
    defineOperation<{ text: string }>({
      name: 'demo.echo',
      summary: 'Echo',
      kind: 'query',
      validate: (input) => ({ text: requiredString(input, 'text', 'demo.echo') }),
      createRequest: (input) => input,
    }),
  ],
});

const capture = () => {
  const out: string[] = [];
  const io: ToolIo = {
    stdout: (line) => void out.push(line),
    stderr: (line) => void out.push(`ERR ${line}`),
  };
  return { out, io };
};

describe('tokenizeLine', () => {
  it.each([
    ['a b  c', ['a', 'b', 'c']],
    ['op --json \'{"a": "b c"}\'', ['op', '--json', '{"a": "b c"}']],
    ['op --text "say \\"hi\\" \\\\ now"', ['op', '--text', 'say "hi" \\ now']],
    ['op "" x', ['op', '', 'x']],
    ['a\\ b', ['a b']],
    ['it\'"s"\'', ['it"s"']],
    ['   ', []],
  ])('%j -> %j', (line, tokens) => {
    expect(tokenizeLine(line)).toEqual(tokens);
  });

  it('refuses an unterminated quote', () => {
    expect(() => tokenizeLine('op "open')).toThrow(/Unterminated double quote/);
  });
});

describe('runOneShot', () => {
  it('prints one envelope line and returns its exit code', async () => {
    const { out, io } = capture();
    expect(await runOneShot(runtime, ['demo.echo', '--text', 'hi'], io)).toBe(0);
    expect(out).toHaveLength(1);
    expect(JSON.parse(out[0] as string)).toMatchObject({
      status: 'success',
      data: { got: { text: 'hi' } },
    });
  });

  it('returns exit code 2 for a usage error and still prints an envelope', async () => {
    const { out, io } = capture();
    expect(await runOneShot(runtime, ['demo.echo', '--text', 'hi', '--bogus', 'x'], io)).toBe(2);
    expect(JSON.parse(out[0] as string)).toMatchObject({
      status: 'error',
      error: { code: 'INVALID_INPUT' },
    });
  });

  it('turns an argument-parsing failure into an envelope with the parser error code', async () => {
    const { out, io } = capture();
    expect(await runOneShot(runtime, ['demo.echo', 'stray'], io)).toBe(2);
    expect(JSON.parse(out[0] as string)).toMatchObject({
      operation: 'parse',
      error: { code: 'UNEXPECTED_ARGUMENT' },
    });
    expect(await runOneShot(runtime, [], io)).toBe(2);
  });

  it('lists operations for --help and for the help command', async () => {
    const a = capture();
    expect(await runOneShot(runtime, ['--help'], a.io, 'indie-writer-studio')).toBe(0);
    expect(a.out[0]).toContain('Usage: indie-writer-studio');
    expect(a.out[0]).toContain('demo.echo');
    const b = capture();
    await runOneShot(runtime, ['help', 'demo.echo'], b.io);
    expect(JSON.parse(b.out[0] as string).data).toMatchObject({ name: 'demo.echo' });
  });
});

describe('runInteractiveRepl', () => {
  const session = async (script: string, json = true) => {
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on('data', (c) => chunks.push(String(c)));
    const done = runInteractiveRepl(runtime, { input, output, json });
    input.end(script);
    await done;
    return chunks.join('').split('\n').filter(Boolean);
  };

  it('answers one envelope per command line, in json mode, honouring quotes', async () => {
    const lines = await session("demo.echo --text 'two words'\ndemo.echo\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] as string)).toMatchObject({
      status: 'success',
      data: { got: { text: 'two words' } },
    });
    expect(JSON.parse(lines[1] as string)).toMatchObject({
      status: 'error',
      error: { code: 'INVALID_INPUT' },
    });
  });

  it('stops at exit or quit and ignores blank lines', async () => {
    expect(await session('\ndemo.echo --text a\nexit\ndemo.echo --text b\n')).toHaveLength(1);
    expect(await session('quit\ndemo.echo --text b\n')).toHaveLength(0);
  });

  it('reports a tokenizing or parsing problem without ending the session', async () => {
    const lines = await session('demo.echo --text "open\ndemo.echo --text ok\n');
    expect(JSON.parse(lines[0] as string)).toMatchObject({ status: 'error', operation: 'parse' });
    expect(JSON.parse(lines[1] as string)).toMatchObject({ status: 'success' });
  });

  it('answers help in text, or as an envelope for a topic and in json mode', async () => {
    const text = (await session('help\nhelp demo.echo\n', false)).join('\n');
    expect(text).toContain('Usage: tool');
    expect(text).toContain('SUCCESS  help');
    const json = await session('help\nhelp nope\n');
    expect(JSON.parse(json[0] as string).data.operations).toHaveLength(1);
    expect(JSON.parse(json[1] as string)).toMatchObject({
      status: 'error',
      error: { code: 'UNKNOWN_OPERATION' },
    });
  });
});

describe('formatEnvelope', () => {
  it('shows status, operation, exit code, error and data', () => {
    expect(
      formatEnvelope({
        schemaVersion: '1.0.0',
        correlationId: 'c',
        operation: 'x.y',
        kind: 'query',
        status: 'error',
        exitCode: 4,
        error: { code: 'E', message: 'bad', details: { a: 1 } },
      }),
    ).toBe('ERROR  x.y  (exit 4)\n  E: bad\n  {\n    "a": 1\n  }');
  });
});

describe('runJsonLinesDriver (sidecar)', () => {
  const exchange = async (...lines: string[]) => {
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks: string[] = [];
    output.on('data', (c) => chunks.push(String(c)));
    const done = runJsonLinesDriver(runtime, input, output);
    input.end(lines.map((l) => `${l}\n`).join(''));
    await done;
    return chunks
      .join('')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  };

  it('answers one envelope per request line, in order, echoing the correlation id', async () => {
    const out = await exchange(
      '{"operation":"demo.echo","input":{"text":"a"},"correlationId":"one"}',
      '{"operation":"demo.echo","input":{"text":"b"},"correlationId":"two"}',
    );
    expect(out.map((e) => [e.correlationId, e.status, e.data.got.text])).toEqual([
      ['one', 'success', 'a'],
      ['two', 'success', 'b'],
    ]);
  });

  it('keeps going after a bad line, and ignores blank lines', async () => {
    const out = await exchange(
      'not json',
      '',
      '[1]',
      '{"operation":7}',
      '{}',
      '{"operation":"demo.echo","input":{"text":"ok"}}',
    );
    expect(out.map((e) => e.error?.code ?? e.status)).toEqual([
      'INVALID_JSON_LINE',
      'INVALID_REQUEST',
      'INVALID_REQUEST',
      'INVALID_REQUEST',
      'success',
    ]);
    expect(out.every((e) => e.schemaVersion === '1.0.0')).toBe(true);
  });

  it('keeps the correlation id on a request without an operation', async () => {
    expect((await exchange('{"correlationId":"x"}'))[0]).toMatchObject({
      correlationId: 'x',
      error: { code: 'INVALID_REQUEST' },
    });
  });

  it('treats help as a request, with an optional topic', async () => {
    const out = await exchange(
      '{"operation":"help","correlationId":"h"}',
      '{"operation":"help","input":{"topic":"demo.echo"}}',
      '{"operation":"help","input":{"topic":"nope"}}',
    );
    expect(out[0]).toMatchObject({
      correlationId: 'h',
      operation: 'help',
      data: { operations: [{ name: 'demo.echo' }] },
    });
    expect(out[1].data).toMatchObject({ name: 'demo.echo' });
    expect(out[2]).toMatchObject({ status: 'error', error: { code: 'UNKNOWN_OPERATION' } });
  });

  it('reports usage errors and unknown operations as error envelopes, never as a crash', async () => {
    const out = await exchange('{"operation":"demo.echo","input":{}}', '{"operation":"demo.nope"}');
    expect(out.map((e) => e.error.code)).toEqual(['INVALID_INPUT', 'UNKNOWN_OPERATION']);
  });

  it('ends when its input ends', async () => {
    expect(await exchange()).toEqual([]);
  });
});

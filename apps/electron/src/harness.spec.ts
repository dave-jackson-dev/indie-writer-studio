import { describe, expect, it } from 'vitest';

import { driverCall, parseDriverLine } from './harness.js';

describe('the IPC driver’s control channel', () => {
  it('reads a request line', () => {
    expect(
      parseDriverLine(
        '{"operation":"works.work.list","input":{"status":"draft"},"correlationId":"c"}',
      ),
    ).toEqual({
      kind: 'request',
      operation: 'works.work.list',
      input: { status: 'draft' },
      correlationId: 'c',
    });
  });

  it('defaults a missing input to nothing, and ignores blank lines', () => {
    expect(parseDriverLine('{"operation":"system.health"}')).toMatchObject({
      kind: 'request',
      input: undefined,
    });
    expect(parseDriverLine('   ')).toEqual({ kind: 'blank' });
  });

  it('turns a line that is not JSON, or not an object, into an error to report rather than a crash', () => {
    expect(parseDriverLine('{ not json')).toMatchObject({ kind: 'invalid' });
    expect(parseDriverLine('[1]')).toMatchObject({ kind: 'invalid' });
    expect(parseDriverLine('"x"')).toMatchObject({ kind: 'invalid' });
  });

  it('builds the call the page runs through its own bridge, with the arguments safely quoted', () => {
    const call = driverCall({
      kind: 'request',
      operation: 'works.work.add',
      input: { title: 'a"b\\c\n</script>' },
      correlationId: 'c',
    });
    expect(call).toContain('window.indieWriter.request(');
    const argsText = call.slice('window.indieWriter.request('.length, -1);
    const [operation, input, options] = JSON.parse(`[${argsText}]`);
    expect(operation).toBe('works.work.add');
    expect(input).toEqual({ title: 'a"b\\c\n</script>' });
    expect(options).toEqual({ correlationId: 'c' });
  });

  it('sends help through the bridge’s help function', () => {
    expect(
      driverCall({
        kind: 'request',
        operation: 'help',
        input: { topic: 'works.work.add' },
        correlationId: undefined,
      }),
    ).toBe('window.indieWriter.help("works.work.add")');
    expect(
      driverCall({
        kind: 'request',
        operation: 'help',
        input: undefined,
        correlationId: undefined,
      }),
    ).toBe('window.indieWriter.help(undefined)');
  });
});

describe('the IPC driver’s eval lines (a test can run code in the page)', () => {
  it('reads an eval line with its id', () => {
    expect(parseDriverLine('{"eval":"1+1","id":"e1"}')).toEqual({
      kind: 'eval',
      code: '1+1',
      id: 'e1',
    });
  });

  it('does not mistake an eval line for a request', () => {
    expect(parseDriverLine('{"eval":"x","operation":"works.work.list"}')).toMatchObject({
      kind: 'eval',
    });
  });
});

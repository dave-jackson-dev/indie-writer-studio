import {
  CqrsToolRuntime,
  defineOperation,
  requiredString,
} from '@indie-writer-studio/cqrs-tool-runtime';
import { REQUEST_CHANNEL } from '@indie-writer-studio/ipc-bridge';
import { describe, expect, it } from 'vitest';

import { registerIpcTransport, type IpcEventLike, type IpcMainLike } from './handler.js';

const RENDERER = '/app/renderer';
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

/** Just enough of `ipcMain` to register on and call into. */
function fakeIpc() {
  const handlers = new Map<string, (event: IpcEventLike, payload: unknown) => Promise<unknown>>();
  const ipc: IpcMainLike = {
    handle: (channel, listener) => void handlers.set(channel, listener),
    removeHandler: (channel) => void handlers.delete(channel),
  };
  return {
    ipc,
    handlers,
    call: (event: IpcEventLike, payload: unknown) => handlers.get(REQUEST_CHANNEL)!(event, payload),
  };
}

const fromApp: IpcEventLike = { senderFrame: { url: 'file:///app/renderer/index.html' } };

describe('the IPC transport', () => {
  it('listens on the one request channel', () => {
    const { ipc, handlers } = fakeIpc();
    registerIpcTransport(ipc, runtime, RENDERER);
    expect([...handlers.keys()]).toEqual([REQUEST_CHANNEL]);
  });

  it('runs a request from the application’s page through the shared dispatch and returns the envelope unchanged', async () => {
    const { ipc, call } = fakeIpc();
    registerIpcTransport(ipc, runtime, RENDERER);
    expect(
      await call(fromApp, { operation: 'demo.echo', input: { text: 'hi' }, correlationId: 'c-1' }),
    ).toMatchObject({
      schemaVersion: '1.0.0',
      operation: 'demo.echo',
      status: 'success',
      correlationId: 'c-1',
    });
  });

  it('answers help like any other request', async () => {
    const { ipc, call } = fakeIpc();
    registerIpcTransport(ipc, runtime, RENDERER);
    expect(JSON.stringify(await call(fromApp, { operation: 'help' }))).toContain('demo.echo');
  });

  it('turns a failing operation into an error envelope, never a rejection', async () => {
    const { ipc, call } = fakeIpc();
    registerIpcTransport(ipc, runtime, RENDERER);
    expect(await call(fromApp, { operation: 'demo.echo', input: {} })).toMatchObject({
      status: 'error',
      error: { code: 'INVALID_INPUT' },
    });
    expect(await call(fromApp, { operation: 'nope.nothing' })).toMatchObject({
      status: 'error',
      error: { code: 'UNKNOWN_OPERATION' },
    });
  });

  it.each([null, 'demo.echo', 7, [], {}, { operation: '' }, { input: {} }])(
    'refuses the malformed request %j as INVALID_REQUEST',
    async (payload) => {
      const { ipc, call } = fakeIpc();
      registerIpcTransport(ipc, runtime, RENDERER);
      expect(await call(fromApp, payload)).toMatchObject({
        status: 'error',
        error: { code: 'INVALID_REQUEST' },
      });
    },
  );

  it.each([
    ['another file', { senderFrame: { url: 'file:///elsewhere/index.html' } }],
    [
      'a sibling that shares the prefix',
      { senderFrame: { url: 'file:///app/renderer-evil/index.html' } },
    ],
    ['a web page', { senderFrame: { url: 'https://example.com/' } }],
    ['a data URL', { senderFrame: { url: 'data:text/html,hi' } }],
    ['an unparseable url', { senderFrame: { url: 'not a url' } }],
    ['no frame at all', {}],
    ['a null frame', { senderFrame: null }],
  ])('never runs a request from %s, and says why', async (_label, event) => {
    const { ipc, call } = fakeIpc();
    let ran = false;
    const spying = new CqrsToolRuntime({
      commandBus: { execute: async () => void (ran = true) },
      queryBus: { execute: async () => void (ran = true) },
      operations: [
        defineOperation({
          name: 'demo.run',
          summary: 'Run',
          kind: 'command',
          createRequest: () => ({}),
        }),
      ],
    });
    registerIpcTransport(ipc, spying, RENDERER);
    expect(await call(event as IpcEventLike, { operation: 'demo.run' })).toMatchObject({
      status: 'error',
      error: { code: 'FORBIDDEN_SENDER' },
    });
    expect(ran).toBe(false);
  });

  it('stops listening when told to', () => {
    const { ipc, handlers } = fakeIpc();
    registerIpcTransport(ipc, runtime, RENDERER)();
    expect(handlers.size).toBe(0);
  });
});

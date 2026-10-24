import { describe, expect, it } from 'vitest';

import type { IndieWriterBridge as PreloadBridge } from '@indie-writer-studio/ipc-bridge';

import { OperationError, requireBridge, runOperation, type IndieWriterBridge } from './operations';

// The window restates the bridge's shape; this fails to compile if the preload bridge stops fitting it.
const _preloadFits = (bridge: PreloadBridge): IndieWriterBridge => bridge;
void _preloadFits;

const envelope = (over: Record<string, unknown>) =>
  ({
    schemaVersion: '1.0.0',
    correlationId: 'c',
    operation: 'x',
    kind: 'query',
    status: 'success',
    exitCode: 0,
    ...over,
  }) as never;

const bridgeAnswering = (answer: unknown): PreloadBridge => ({
  request: async () => answer as never,
  help: async () => answer as never,
});

describe('runOperation', () => {
  it('resolves to the data of a successful envelope', async () => {
    const bridge = bridgeAnswering(envelope({ data: { works: [] } }));
    await expect(runOperation<{ works: unknown[] }>(bridge, 'works.work.list')).resolves.toEqual({
      works: [],
    });
  });

  it('passes the operation and its input to the bridge', async () => {
    const seen: unknown[] = [];
    const bridge: PreloadBridge = {
      request: async (operation, input) => (seen.push(operation, input), envelope({ data: {} })),
      help: async () => envelope({}),
    };
    await runOperation(bridge, 'works.work.add', { title: 'T' });
    expect(seen).toEqual(['works.work.add', { title: 'T' }]);
  });

  it('throws an OperationError carrying the code and the message of an error envelope', async () => {
    const bridge = bridgeAnswering(
      envelope({
        status: 'error',
        exitCode: 2,
        error: { code: 'INVALID_WORK', message: 'A Work needs a title.' },
      }),
    );
    const failure = await runOperation(bridge, 'works.work.add').catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(OperationError);
    expect(failure).toMatchObject({ code: 'INVALID_WORK', message: 'A Work needs a title.' });
  });

  it('treats an envelope that is neither success nor error as a failure', async () => {
    const bridge = bridgeAnswering(envelope({ status: 'incomplete', exitCode: 4 }));
    await expect(runOperation(bridge, 'x')).rejects.toBeInstanceOf(OperationError);
  });
});

describe('requireBridge', () => {
  it('returns the bridge the preload script exposed', () => {
    const bridge = bridgeAnswering(envelope({}));
    expect(requireBridge({ indieWriter: bridge })).toBe(bridge);
  });

  it('says plainly when the window was not given a bridge', () => {
    expect(() => requireBridge({})).toThrow(/bridge/i);
  });
});

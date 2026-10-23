import {
  dispatchRequest,
  TOOL_ENVELOPE_VERSION,
  TOOL_EXIT_CODES,
  type CqrsToolRuntime,
  type ToolEnvelope,
} from '@indie-writer-studio/cqrs-tool-runtime';
import { REQUEST_CHANNEL } from '@indie-writer-studio/ipc-bridge';

import { isAllowedNavigation } from '../security.js';

/** The part of `ipcMain` the transport uses, so it can be tested without Electron. */
export interface IpcMainLike {
  handle(
    channel: string,
    listener: (event: IpcEventLike, payload: unknown) => Promise<unknown>,
  ): void;
  removeHandler(channel: string): void;
}
export interface IpcEventLike {
  senderFrame?: { url: string } | null;
}

const forbidden = (): ToolEnvelope => ({
  schemaVersion: TOOL_ENVELOPE_VERSION,
  correlationId: 'forbidden-sender',
  operation: 'ipc',
  kind: 'system',
  status: 'error',
  exitCode: TOOL_EXIT_CODES.usage,
  error: {
    code: 'FORBIDDEN_SENDER',
    message: 'Requests are accepted only from the application window.',
  },
});

/**
 * The IPC transport (ADR-004 D2): a request from the application's own page goes through the shared
 * dispatch and the envelope comes back unchanged. A request from any other frame (a page that
 * navigated away, an iframe) is refused with an envelope and never run.
 */
export function registerIpcTransport(
  ipc: IpcMainLike,
  runtime: CqrsToolRuntime,
  rendererDir: string,
): () => void {
  ipc.handle(REQUEST_CHANNEL, async (event, request) => {
    const url = event.senderFrame?.url;
    if (url === undefined || !isAllowedNavigation(url, rendererDir)) return forbidden();
    return dispatchRequest(runtime, request);
  });
  return () => ipc.removeHandler(REQUEST_CHANNEL);
}

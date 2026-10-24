/**
 * The window's view of the bridge the preload script exposes (`IndieWriterBridge` in the ipc-bridge
 * library). It is restated here, not imported: that library's types reach into Node-only code, which
 * a page must not compile against. A spec checks the two stay compatible.
 */
export interface Envelope {
  status: 'success' | 'incomplete' | 'error';
  data?: unknown;
  error?: { code: string; message: string };
}

export interface IndieWriterBridge {
  request(operation: string, input?: Record<string, unknown>): Promise<Envelope>;
}

/** An operation the app refused or could not finish; the code is the app's, the message is for the author. */
export class OperationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'OperationError';
  }
}

/** The bridge the preload script gave the window, or a plain statement that it did not. */
export function requireBridge(host: { indieWriter?: IndieWriterBridge }): IndieWriterBridge {
  if (host.indieWriter === undefined) {
    throw new OperationError('NO_BRIDGE', 'The window was opened without its bridge to the app.');
  }
  return host.indieWriter;
}

/** Runs an operation and resolves to its data; any other outcome is an OperationError. */
export async function runOperation<T>(
  bridge: IndieWriterBridge,
  operation: string,
  input?: Record<string, unknown>,
): Promise<T> {
  const envelope = await bridge.request(operation, input);
  if (envelope.status === 'success') return envelope.data as T;
  throw new OperationError(
    envelope.error?.code ?? envelope.status.toUpperCase(),
    envelope.error?.message ?? `The app did not finish ${operation}.`,
  );
}

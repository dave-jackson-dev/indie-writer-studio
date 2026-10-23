import type { ToolEnvelope } from '@indie-writer-studio/cqrs-tool-runtime';

/** The one channel a request travels on, in the app's own namespace. */
export const REQUEST_CHANNEL = 'indie-writer:request';

/** The name the preload script gives the bridge on the page's `window`. */
export const BRIDGE_NAME = 'indieWriter';

/** Everything the page is given, and nothing else. */
export const BRIDGE_METHODS = ['request', 'help'] as const;

/** What the preload script exposes to the page as `window.indieWriter`. */
export interface IndieWriterBridge {
  /** Runs an operation and resolves to its envelope. Failures are envelopes, not rejections. */
  request(
    operation: string,
    input?: Record<string, unknown>,
    options?: { correlationId?: string },
  ): Promise<ToolEnvelope>;
  /** The operation list, or one operation's help. */
  help(topic?: string): Promise<ToolEnvelope>;
}

/** What travels on `REQUEST_CHANNEL`. */
export interface BridgeRequest {
  operation: string;
  input?: Record<string, unknown>;
  correlationId?: string;
}

/** Whether a value has the shape of a request: an object with a non-empty string `operation`. */
export function isEnvelopeRequest(value: unknown): value is BridgeRequest {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { operation?: unknown }).operation === 'string' &&
    (value as { operation: string }).operation !== ''
  );
}

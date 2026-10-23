/** The shared response envelope every transport answers with. */
export interface Envelope {
  schemaVersion: string;
  correlationId: string;
  operation: string;
  kind: string;
  status: 'success' | 'incomplete' | 'error';
  exitCode: number;
  data?: unknown;
  error?: { code: string; message: string; details?: unknown };
}

/**
 * Screenplay ability: the Author can operate the app. How is the assembly's business.
 *
 * Scenarios say what an author does, never how the app is reached, so the same feature files run
 * in-process (fast, the default) and against the built binary over each transport.
 */
export interface OperateApp {
  readonly assembly: string;
  invoke(operation: string, input?: Record<string, unknown>): Promise<Envelope>;
  /** Stops the app and starts it again over the same data, as a relaunch of the real app would. */
  restart(): Promise<void>;
  close(): Promise<void>;
}

import type { CqrsToolRuntime } from '@indie-writer-studio/cqrs-tool-runtime';

import { createComponents } from '../../indie-writer/src/app/components.js';
import { createTool } from '../../indie-writer/src/app/run.js';

export interface Host {
  readonly runtime: CqrsToolRuntime;
  /** Closes the database and the application context, once however often it is asked. */
  close(): Promise<void>;
}

export interface HostOptions {
  /** Where the database lives. Without one, it is in memory and gone on exit. */
  readonly dataDir?: string | undefined;
}

/** Boots the indie-writer root inside this process: the same composition every other transport serves. */
export async function bootHost(options: HostOptions = {}): Promise<Host> {
  const tool = await createTool(createComponents({ dataDir: options.dataDir }));
  let closing: Promise<void> | undefined;
  return { runtime: tool.runtime, close: () => (closing ??= tool.close()) };
}

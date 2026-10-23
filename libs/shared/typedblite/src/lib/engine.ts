import { pathToFileURL } from 'node:url';

import { bundlePath } from './bundle.js';

/** One result row: each selected variable holds an attribute whose value is `raw`. */
export type EngineRow = Readonly<Record<string, { readonly raw: unknown } | undefined>>;

/**
 * The only part of TypeDBLite this repository depends on. The engine is loaded from the vendored
 * bundle at run time and none of its types are imported, so a change there cannot break this
 * repository's typecheck.
 */
export interface TypeDBLiteEngine {
  readonly hasSchema: boolean;
  define(schema: string): Promise<unknown>;
  execute(query: string): Promise<unknown>;
  query(query: string): Promise<{ readonly rows: readonly EngineRow[] }>;
  transaction<T>(work: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export class TypeDBLiteUnavailableError extends Error {
  readonly code = 'TYPEDBLITE_UNAVAILABLE';
  /** The runtime's `infrastructure` exit code. */
  readonly exitCode = 10;

  constructor(path: string, cause?: unknown) {
    super(
      `The TypeDBLite engine could not be loaded from '${path}'. Run \`npm run vendor:bundle\` ` +
        `against a built lean-agile-os checkout, or set TYPEDBLITE_BUNDLE to a bundle that exists` +
        `${cause instanceof Error ? ` (${cause.message})` : ''}.`,
    );
    this.name = 'TypeDBLiteUnavailableError';
  }
}

/** Opens a TypeDBLite database at `location`: a file path, or `:memory:` (SQLite's in-memory database). */
export async function openEngine(
  location = ':memory:',
  env: NodeJS.ProcessEnv = process.env,
): Promise<TypeDBLiteEngine> {
  const path = bundlePath(env);
  try {
    const module = (await import(/* @vite-ignore */ pathToFileURL(path).href)) as {
      SqliteEngine: new (location: string) => TypeDBLiteEngine;
    };
    return new module.SqliteEngine(location);
  } catch (error) {
    throw new TypeDBLiteUnavailableError(path, error);
  }
}

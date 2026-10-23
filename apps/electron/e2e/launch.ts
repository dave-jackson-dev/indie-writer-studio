import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { electronEnv } from '../src/launch-env.js';
import { launchCommand } from '../src/launcher.js';

const here = dirname(fileURLToPath(import.meta.url));
export const APP_DIR = resolve(here, '../../../dist/apps/electron');
const electronPath = createRequire(import.meta.url)('electron') as string;

export interface Running {
  readonly child: ChildProcessWithoutNullStreams;
  /** Every JSON line the app has printed, oldest first. */
  readonly lines: unknown[];
  /** Resolves with the next printed line that satisfies `match`. */
  next(match?: (line: any) => boolean, timeoutMs?: number): Promise<any>;
  send(message: unknown): void;
  exit(): Promise<number | null>;
  /** Ends the app and everything the launcher started with it (the X server under `xvfb-run`). */
  kill(): void;
}

/** Starts the built app, as a user would, with the harness arguments given. */
export function launch(args: string[], env: NodeJS.ProcessEnv = {}): Running {
  const { command, args: argv } = launchCommand({
    electronPath,
    appDir: APP_DIR,
    args,
    platform: process.platform,
    display: process.env['DISPLAY'],
    uid: process.getuid?.() ?? 1,
  });
  const child = spawn(command, argv, {
    env: { ...electronEnv(process.env), ...env },
    detached: true, // its own process group, so a kill reaches Xvfb as well as the wrapper
  });
  const lines: unknown[] = [];
  const waiting: { match: (line: any) => boolean; resolve: (line: any) => void }[] = [];
  createInterface({ input: child.stdout }).on('line', (text) => {
    let line: unknown;
    try {
      line = JSON.parse(text);
    } catch {
      return; // Chromium's own chatter
    }
    lines.push(line);
    const at = waiting.findIndex((w) => w.match(line));
    if (at >= 0) waiting.splice(at, 1)[0]?.resolve(line);
  });
  const exited = new Promise<number | null>((done) => child.on('close', (code) => done(code)));
  return {
    child,
    lines,
    next: (match = () => true, timeoutMs = 60_000) =>
      new Promise((resolve, reject) => {
        const seen = lines.find(match);
        if (seen !== undefined && !waiting.length) return resolve(seen);
        const timer = setTimeout(
          () =>
            reject(
              new Error(`no matching line within ${timeoutMs} ms; saw ${JSON.stringify(lines)}`),
            ),
          timeoutMs,
        );
        waiting.push({ match, resolve: (line) => (clearTimeout(timer), resolve(line)) });
      }),
    send: (message) => void child.stdin.write(`${JSON.stringify(message)}\n`),
    kill: () => {
      try {
        if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
      } catch {
        // already gone
      }
    },
    exit: async () => {
      child.stdin.end();
      return exited;
    },
  };
}

export const tempDataDir = async (): Promise<string> => {
  const { mkdtemp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  return mkdtemp(join(tmpdir(), 'iws-electron-'));
};

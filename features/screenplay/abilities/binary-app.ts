import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Envelope, OperateApp } from './operate-app.ts';

interface Pending {
  resolve(envelope: Envelope): void;
  reject(error: Error): void;
}

export const BUNDLE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../dist/apps/indie-writer/main.js',
);

export type BinaryTransport = 'cli' | 'repl' | 'sidecar' | 'http';

interface Spawned {
  code: number | null;
  stdout: string;
  stderr: string;
}

const firstLine = (text: string): string => text.trim().split('\n')[0] ?? '';

/** Double-quotes a value so the REPL's tokenizer gives it back unchanged. */
const replQuote = (value: string): string =>
  `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/** Binary-tier assembly: the built bundle as a real process, over one transport. */
export class BinaryApp implements OperateApp {
  readonly assembly: string;
  private child: ChildProcessWithoutNullStreams | undefined;
  private url: string | undefined;
  private pending: Pending[] = [];
  private childStderr = '';
  private buffer = '';

  constructor(
    private readonly transport: BinaryTransport,
    private readonly dataDir: string,
  ) {
    this.assembly = transport;
  }

  private env(): NodeJS.ProcessEnv {
    return { ...process.env, INDIE_WRITER_DATA_DIR: this.dataDir };
  }

  private run(args: string[], stdin = ''): Promise<Spawned> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [BUNDLE, ...args], { env: this.env() });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => (stdout += chunk));
      child.stderr.on('data', (chunk) => (stderr += chunk));
      child.on('error', reject);
      child.on('close', (code) => resolve({ code, stdout, stderr }));
      child.stdin.end(stdin);
    });
  }

  async invoke(operation: string, input: Record<string, unknown> = {}): Promise<Envelope> {
    const json = JSON.stringify(input);
    switch (this.transport) {
      case 'cli':
        return JSON.parse(firstLine((await this.run([operation, '--json', json])).stdout));
      case 'repl':
        return this.lineSession(['--repl', '--json'], `${operation} --json ${replQuote(json)}`);
      case 'sidecar':
        return this.lineSession(['--sidecar'], JSON.stringify({ operation, input }));
      case 'http': {
        const response = await fetch(`${await this.startHttp()}/operations/${operation}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: json,
        });
        return (await response.json()) as Envelope;
      }
    }
  }

  /**
   * One long-lived process that answers one envelope line per request line, in order: the REPL
   * (`--repl --json`) and the sidecar (`--sidecar`) both speak this way. It lives for the scenario,
   * so the engine is loaded once, and a restart ends it and starts another.
   */
  private lineSession(args: string[], request: string): Promise<Envelope> {
    if (!this.child) {
      const child = spawn(process.execPath, [BUNDLE, ...args], { env: this.env() });
      this.childStderr = '';
      child.stderr.on('data', (chunk) => (this.childStderr += chunk));
      child.stdout.on('data', (chunk) => {
        this.buffer += chunk;
        let newline = this.buffer.indexOf('\n');
        while (newline >= 0) {
          const line = this.buffer.slice(0, newline);
          this.buffer = this.buffer.slice(newline + 1);
          this.answer(line);
          newline = this.buffer.indexOf('\n');
        }
      });
      // A child that ends, or cannot start, fails what is waiting on it instead of leaving it to time out.
      const gone = (why: string) => {
        const waiting = this.pending.splice(0);
        for (const { reject } of waiting) {
          reject(new Error(`The app ${why} with a request pending.${this.stderrNote()}`));
        }
      };
      child.on('error', (error) => gone(`could not run (${error.message})`));
      child.on('exit', (code, signal) => gone(`exited (${signal ?? `code ${String(code)}`})`));
      this.child = child;
    }
    const child = this.child;
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      child.stdin.write(`${request}\n`, (error) => {
        if (error)
          reject(new Error(`Could not send the request: ${error.message}.${this.stderrNote()}`));
      });
    });
  }

  /** One line of output is one envelope for the oldest waiting request; anything else is an error to see. */
  private answer(line: string): void {
    const waiting = this.pending.shift();
    if (waiting === undefined) return;
    try {
      waiting.resolve(JSON.parse(line) as Envelope);
    } catch {
      waiting.reject(
        new Error(`The app printed something that is not an envelope: ${line.slice(0, 200)}`),
      );
    }
  }

  private stderrNote(): string {
    return this.childStderr.trim() === '' ? '' : ` It said: ${this.childStderr.trim().slice(-500)}`;
  }

  private async startHttp(): Promise<string> {
    if (this.url) return this.url;
    const child = spawn(process.execPath, [BUNDLE, '--http', '--port', '0'], { env: this.env() });
    this.child = child;
    this.url = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('http transport did not start')), 15000);
      let out = '';
      child.stdout.on('data', (chunk) => {
        out += chunk;
        if (out.includes('\n')) {
          clearTimeout(timer);
          resolve((JSON.parse(out.split('\n')[0] as string) as { url: string }).url);
        }
      });
      child.on('error', reject);
    });
    return this.url;
  }

  async restart(): Promise<void> {
    await this.close();
  }

  async close(): Promise<void> {
    const child = this.child;
    this.child = undefined;
    this.url = undefined;
    this.pending = [];
    this.buffer = '';
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise<void>((resolve) => {
      child.on('close', () => resolve());
      if (this.transport === 'sidecar' || this.transport === 'repl') child.stdin.end();
      else child.kill('SIGTERM');
    });
  }
}

import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';

import {
  TOOL_ENVELOPE_VERSION,
  TOOL_EXIT_CODES,
  type ToolEnvelope,
  type ToolIo,
} from './contracts.js';
import { CqrsToolRuntime, parseToolArguments } from './runtime.js';

const defaultIo: ToolIo = {
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
};

const systemError = (
  operation: string,
  correlationId: string,
  code: string,
  message: string,
): ToolEnvelope => ({
  schemaVersion: TOOL_ENVELOPE_VERSION,
  correlationId,
  operation,
  kind: 'system',
  status: 'error',
  exitCode: TOOL_EXIT_CODES.usage,
  error: { code, message },
});

/** CLI: one operation, the envelope as one JSON line on stdout, the envelope's exit code returned. */
export async function runOneShot(
  runtime: CqrsToolRuntime,
  arguments_: readonly string[],
  io: ToolIo = defaultIo,
  executable = 'tool',
): Promise<number> {
  if (arguments_.includes('--help') || arguments_.includes('-h')) {
    io.stdout(runtime.help(executable));
    return TOOL_EXIT_CODES.success;
  }
  if (arguments_[0] === 'help') {
    const envelope = runtime.helpEnvelope(undefined, arguments_[1]);
    io.stdout(JSON.stringify(envelope));
    return envelope.exitCode;
  }
  try {
    const { operation, input } = parseToolArguments(arguments_);
    const envelope = await runtime.dispatch(operation, input);
    io.stdout(JSON.stringify(envelope));
    return envelope.exitCode;
  } catch (error) {
    const envelope = systemError(
      'parse',
      'argument-parsing',
      typeof (error as { code?: unknown })?.code === 'string'
        ? (error as { code: string }).code
        : 'INVALID_ARGUMENTS',
      error instanceof Error ? error.message : 'Invalid arguments',
    );
    io.stdout(JSON.stringify(envelope));
    return envelope.exitCode;
  }
}

/**
 * Splits a REPL line the way a shell would, minus expansion: whitespace separates words, single
 * quotes are literal, double quotes allow `\"` and `\\`, and a backslash escapes outside quotes.
 */
export function tokenizeLine(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inToken = false;
  let quote: '"' | "'" | undefined;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i] as string;
    if (quote === "'") {
      if (char === "'") quote = undefined;
      else current += char;
    } else if (quote === '"') {
      if (char === '"') quote = undefined;
      else if (char === '\\' && (line[i + 1] === '"' || line[i + 1] === '\\')) current += line[++i];
      else current += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      inToken = true;
    } else if (char === '\\' && i + 1 < line.length) {
      current += line[++i];
      inToken = true;
    } else if (/\s/.test(char)) {
      if (inToken || current) tokens.push(current);
      current = '';
      inToken = false;
    } else {
      current += char;
      inToken = true;
    }
  }
  if (quote) throw new Error(`Unterminated ${quote === "'" ? 'single' : 'double'} quote`);
  if (inToken || current) tokens.push(current);
  return tokens;
}

export interface ReplOptions {
  readonly input?: Readable;
  readonly output?: Writable;
  readonly prompt?: string;
  /** One compact JSON envelope per command, for scripts and tests; otherwise a readable summary. */
  readonly json?: boolean;
}

/** A readable rendering of an envelope for the interactive REPL. */
export function formatEnvelope(envelope: ToolEnvelope): string {
  const lines = [
    `${envelope.status.toUpperCase()}  ${envelope.operation}  (exit ${envelope.exitCode})`,
  ];
  if (envelope.error) lines.push(`  ${envelope.error.code}: ${envelope.error.message}`);
  if (envelope.error?.details !== undefined) {
    lines.push(
      ...JSON.stringify(envelope.error.details, null, 2)
        .split('\n')
        .map((l) => `  ${l}`),
    );
  }
  if (envelope.data !== undefined) {
    lines.push(...(JSON.stringify(envelope.data, null, 2) ?? '').split('\n').map((l) => `  ${l}`));
  }
  return lines.join('\n');
}

/**
 * REPL: a stateless prompt over the same operations. `help [operation]`, `exit` and `quit` are
 * built in; everything else is `<operation> [--key value] [--json '{...}']` exactly as on the CLI.
 * Resolves when input ends or the user exits.
 */
export async function runInteractiveRepl(
  runtime: CqrsToolRuntime,
  options: ReplOptions = {},
): Promise<void> {
  const output = options.output ?? process.stdout;
  const interactive = options.input === undefined && Boolean(process.stdin.isTTY);
  const lines = createInterface({
    input: options.input ?? process.stdin,
    output: interactive ? output : undefined,
    prompt: options.prompt ?? 'indie-writer-studio> ',
    completer: (line: string) => {
      const [candidates] = runtime.completeReplLine(line);
      const last = line.split(/\s+/).at(-1) ?? '';
      return [(candidates ?? []).filter((c) => c.startsWith(last)), last];
    },
    crlfDelay: Number.POSITIVE_INFINITY,
  });
  const print = (text: string): void => void output.write(`${text}\n`);
  const show = (envelope: ToolEnvelope): void =>
    print(options.json ? JSON.stringify(envelope) : formatEnvelope(envelope));

  if (interactive) lines.prompt();
  for await (const raw of lines) {
    const line = raw.trim();
    if (line === 'exit' || line === 'quit') break;
    if (line) {
      try {
        const tokens = tokenizeLine(line);
        if (tokens[0] === 'help' || tokens[0] === '?') {
          const envelope = runtime.helpEnvelope(undefined, tokens[1]);
          print(
            options.json
              ? JSON.stringify(envelope)
              : tokens[1]
                ? formatEnvelope(envelope)
                : runtime.help(),
          );
        } else {
          const { operation, input } = parseToolArguments(tokens);
          show(await runtime.dispatch(operation, input));
        }
      } catch (error) {
        show(
          systemError(
            'parse',
            'argument-parsing',
            typeof (error as { code?: unknown })?.code === 'string'
              ? (error as { code: string }).code
              : 'INVALID_ARGUMENTS',
            error instanceof Error ? error.message : 'Invalid arguments',
          ),
        );
      }
    }
    if (interactive) lines.prompt();
  }
  lines.close();
}

/** One request line on the sidecar's stdin. */
export interface SidecarRequest {
  readonly operation: string;
  readonly input?: Record<string, unknown>;
  readonly correlationId?: string;
}

/**
 * Sidecar: newline-delimited JSON over a pair of streams, for a host process such as the editor
 * extension. Each non-blank input line is one request; each produces exactly one envelope line on
 * the output, in request order (requests are handled one at a time). A line that is not a JSON
 * object with a string `operation` gets an error envelope (`INVALID_JSON_LINE` or
 * `INVALID_REQUEST`) rather than ending the session. `help` is a request like any other, with an
 * optional `input.topic`. The session ends when the input ends.
 */
export async function runJsonLinesDriver(
  runtime: CqrsToolRuntime,
  input: Readable = process.stdin,
  output: Writable = process.stdout,
): Promise<void> {
  const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
  const send = (envelope: ToolEnvelope): void => void output.write(`${JSON.stringify(envelope)}\n`);

  for await (const line of lines) {
    if (!line.trim()) continue;
    let request: unknown;
    try {
      request = JSON.parse(line);
    } catch {
      send(
        systemError(
          'driver',
          'invalid-json-line',
          'INVALID_JSON_LINE',
          'Each input line must be valid JSON',
        ),
      );
      continue;
    }
    send(await dispatchRequest(runtime, request));
  }
}

/**
 * One request in the shape every message transport shares (the sidecar's lines, the IPC transport's
 * messages): `{ operation, input?, correlationId? }`. Anything that is not an object with a string
 * `operation` gets an `INVALID_REQUEST` envelope, keeping a correlation id it was given; `help` is a
 * request like any other, with an optional `input.topic`.
 */
export async function dispatchRequest(
  runtime: CqrsToolRuntime,
  request: unknown,
): Promise<ToolEnvelope> {
  if (typeof request !== 'object' || request === null || Array.isArray(request)) {
    return systemError(
      'driver',
      'invalid-request',
      'INVALID_REQUEST',
      'Each request must be a JSON object',
    );
  }
  const { operation, input, correlationId } = request as Partial<SidecarRequest>;
  const id = typeof correlationId === 'string' ? correlationId : undefined;
  if (typeof operation !== 'string' || operation === '') {
    return systemError(
      'driver',
      id ?? 'invalid-request',
      'INVALID_REQUEST',
      "A request needs a string 'operation'",
    );
  }
  if (operation === 'help') {
    const topic = (input as Record<string, unknown> | undefined)?.['topic'];
    return runtime.helpEnvelope(id, typeof topic === 'string' ? topic : undefined);
  }
  return runtime.dispatch(operation, input ?? {}, id);
}

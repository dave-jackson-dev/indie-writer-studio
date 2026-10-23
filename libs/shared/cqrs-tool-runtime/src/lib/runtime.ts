import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  isIncompleteRun,
  TOOL_ENVELOPE_VERSION,
  TOOL_EXIT_CODES,
  ToolRuntimeError,
  type ToolBus,
  type ToolEnvelope,
  type ToolOperationDescriptor,
} from './contracts.js';
import { assertNoUnknownInput, describeValue, invalidInput, probeInput } from './input.js';

const isInputObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export interface CqrsToolRuntimeOptions {
  readonly commandBus: ToolBus;
  readonly queryBus: ToolBus;
  readonly operations: readonly ToolOperationDescriptor[];
}

export type OperationSummary = Pick<ToolOperationDescriptor, 'kind' | 'name' | 'summary'>;

/** The plain-text operations listing, usable without constructing a runtime (`--help`). */
export function formatOperationsHelp(
  operations: readonly OperationSummary[],
  executable = 'tool',
): string {
  const sorted = [...operations].sort((left, right) => left.name.localeCompare(right.name));
  return [
    `Usage: ${executable} <operation> [--key value] [--json '{...}'] [--json-file <path>]`,
    '',
    'Operations:',
    ...sorted.map((o) => `  ${o.name.padEnd(22)} ${o.kind.padEnd(7)} ${o.summary}`),
    '',
    'Common commands:',
    '  help [operation]       show command help',
    '  exit, quit             close the interactive REPL',
    '',
    'Modes:',
    '  --repl                 interactive command prompt',
    '  --sidecar              newline-delimited JSON protocol',
    '  --http                 HTTP server',
    '  (default)              one operation, then exit',
  ].join('\n');
}

/**
 * The shared dispatch behind CLI, REPL, sidecar and HTTP: one set of descriptors, one envelope.
 */
export class CqrsToolRuntime {
  private readonly operations = new Map<string, ToolOperationDescriptor>();

  public constructor(private readonly options: CqrsToolRuntimeOptions) {
    for (const operation of options.operations) {
      if (this.operations.has(operation.name)) {
        throw new ToolRuntimeError(
          'DUPLICATE_OPERATION',
          `Operation '${operation.name}' is registered more than once`,
          TOOL_EXIT_CODES.usage,
        );
      }
      this.operations.set(operation.name, operation);
    }
  }

  public listOperations(): readonly OperationSummary[] {
    return [...this.operations.values()]
      .map(({ kind, name, summary }) => ({ kind, name, summary }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  /** Full descriptors (including input schemas), for documentation and OpenAPI. */
  public describeOperations(): readonly Omit<
    ToolOperationDescriptor,
    'createRequest' | 'validate'
  >[] {
    return this.listOperations().map((summary) => {
      const { name, kind, summary: text, inputSchema } = this.operations.get(summary.name)!;
      return { name, kind, summary: text, ...(inputSchema && { inputSchema }) };
    });
  }

  public helpEnvelope(correlationId: string = randomUUID(), topic?: string): ToolEnvelope {
    if (topic) {
      const operation = this.describeOperations().find(({ name }) => name === topic);
      if (!operation) {
        return this.errorEnvelope(
          'help',
          'system',
          correlationId,
          new ToolRuntimeError(
            'UNKNOWN_OPERATION',
            `Unknown help topic '${topic}'`,
            TOOL_EXIT_CODES.usage,
          ),
        );
      }
      return this.systemEnvelope('help', correlationId, operation);
    }
    return this.systemEnvelope('help', correlationId, {
      operations: this.listOperations(),
      commonCommands: ['help', 'exit', 'quit'],
    });
  }

  public completeReplLine(input: string): string[][] {
    const trimmed = input.trim();
    const options = ['--help', '--json', '--json-file'];
    const names = this.listOperations().map(({ name }) => name);
    const common = ['help', 'exit', 'quit'];
    if (!trimmed) return [[...common, ...names]];
    if (trimmed === 'help' || trimmed === '?') return [['help', '?', ...names]];
    if (trimmed.startsWith('help ')) {
      const topic = trimmed.slice(5);
      return [names.filter((name) => name.startsWith(topic))];
    }
    const parts = trimmed.split(/\s+/);
    const last = parts.at(-1) ?? '';
    if (trimmed.startsWith('--') || last.startsWith('--')) {
      return [options.filter((option) => option.startsWith(last))];
    }
    if (parts.length > 1) return [[]];
    return [[...common, ...names].filter((name) => name.startsWith(trimmed))];
  }

  public help(executable = 'tool'): string {
    return formatOperationsHelp(this.listOperations(), executable);
  }

  public async dispatch(
    operationName: string,
    rawInput: Record<string, unknown> = {},
    correlationId: string = randomUUID(),
  ): Promise<ToolEnvelope> {
    const operation = this.operations.get(operationName);
    if (!operation) {
      return this.errorEnvelope(
        operationName,
        'system',
        correlationId,
        new ToolRuntimeError(
          'UNKNOWN_OPERATION',
          `Unknown operation '${operationName}'`,
          TOOL_EXIT_CODES.usage,
        ),
      );
    }
    try {
      // Types are erased at every transport boundary (an HTTP body, a sidecar line), so the
      // input's shape is refused here by name rather than failing inside a validator.
      if (!isInputObject(rawInput)) {
        throw invalidInput(
          `${operation.name} needs its input to be an object; received ${describeValue(rawInput)}.`,
        );
      }
      let input: unknown;
      if (operation.validate) {
        const probe = probeInput(rawInput);
        input = operation.validate(probe.input);
        assertNoUnknownInput(operation.name, rawInput, probe);
      } else {
        input = rawInput;
      }
      const request = operation.createRequest(input as Record<string, unknown>);
      const bus = operation.kind === 'command' ? this.options.commandBus : this.options.queryBus;
      const data = await bus.execute(request);
      const stopped = isIncompleteRun(data);
      return {
        schemaVersion: TOOL_ENVELOPE_VERSION,
        correlationId,
        operation: operation.name,
        kind: operation.kind,
        status: stopped ? 'incomplete' : 'success',
        exitCode: stopped ? TOOL_EXIT_CODES.blocked : TOOL_EXIT_CODES.success,
        data,
      };
    } catch (error) {
      return this.errorEnvelope(operation.name, operation.kind, correlationId, error);
    }
  }

  private systemEnvelope(operation: string, correlationId: string, data: unknown): ToolEnvelope {
    return {
      schemaVersion: TOOL_ENVELOPE_VERSION,
      correlationId,
      operation,
      kind: 'system',
      status: 'success',
      exitCode: TOOL_EXIT_CODES.success,
      data,
    };
  }

  private errorEnvelope(
    operation: string,
    kind: ToolEnvelope['kind'],
    correlationId: string,
    error: unknown,
  ): ToolEnvelope {
    const runtimeError = error instanceof ToolRuntimeError ? error : fromDomainError(error);
    return {
      schemaVersion: TOOL_ENVELOPE_VERSION,
      correlationId,
      operation,
      kind,
      status: 'error',
      exitCode: runtimeError.exitCode,
      error: {
        code: runtimeError.code,
        message: runtimeError.message,
        ...(runtimeError.details === undefined ? {} : { details: runtimeError.details }),
      },
    };
  }
}

/**
 * A domain error's own `code` and `exitCode` survive into the envelope, so a caller can branch on
 * `error.code` instead of reading messages. Anything without a code is `HANDLER_FAILURE`.
 */
function fromDomainError(error: unknown): ToolRuntimeError {
  const carried = error as { code?: unknown; exitCode?: unknown; details?: unknown } | null;
  const code =
    typeof carried?.code === 'string' && carried.code.trim() ? carried.code : 'HANDLER_FAILURE';
  const exitCode =
    typeof carried?.exitCode === 'number' && Number.isInteger(carried.exitCode)
      ? carried.exitCode
      : TOOL_EXIT_CODES.failure;
  return new ToolRuntimeError(
    code,
    error instanceof Error ? error.message : 'Unknown handler failure',
    exitCode,
    carried?.details,
  );
}

/**
 * `<operation> [--key value] [--json '{...}'] [--json-file path]`. A bare flag is `true`; a
 * repeated key accumulates into an array (so `--exclude a --exclude b` works, and a key given by
 * both a flag and `--json` is one key given twice, never silently last-wins).
 */
export function parseToolArguments(arguments_: readonly string[]): {
  readonly operation: string;
  readonly input: Record<string, unknown>;
} {
  const [operation, ...rest] = arguments_;
  if (!operation || operation.startsWith('-')) {
    throw new ToolRuntimeError(
      'MISSING_OPERATION',
      'An operation is required',
      TOOL_EXIT_CODES.usage,
    );
  }
  const input: Record<string, unknown> = {};
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index] as string;
    if (argument === '--json' || argument === '--json-file') {
      const isFile = argument === '--json-file';
      const raw = rest[index + 1];
      if (!raw) {
        throw new ToolRuntimeError(
          'MISSING_JSON',
          `${argument} requires ${isFile ? 'a file path' : 'an object'}`,
          TOOL_EXIT_CODES.usage,
        );
      }
      let json = raw;
      if (isFile) {
        try {
          json = readFileSync(raw, 'utf8');
          if (json.charCodeAt(0) === 0xfeff) json = json.slice(1); // a BOM, common from Windows tools
        } catch (error) {
          throw new ToolRuntimeError(
            'JSON_FILE_UNREADABLE',
            `${argument} could not read '${raw}': ${error instanceof Error ? error.message : String(error)}`,
            TOOL_EXIT_CODES.usage,
          );
        }
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        throw new ToolRuntimeError(
          'INVALID_JSON',
          `${argument} must contain valid JSON`,
          TOOL_EXIT_CODES.usage,
        );
      }
      if (!isInputObject(parsed)) {
        throw new ToolRuntimeError(
          'INVALID_JSON',
          `${argument} must contain a JSON object`,
          TOOL_EXIT_CODES.usage,
        );
      }
      for (const [key, value] of Object.entries(parsed)) {
        accumulate(input, key, value, `${argument}'s '${key}'`);
      }
      index += 1;
      continue;
    }
    if (!argument.startsWith('--')) {
      throw new ToolRuntimeError(
        'UNEXPECTED_ARGUMENT',
        `Unexpected argument '${argument}'`,
        TOOL_EXIT_CODES.usage,
      );
    }
    const key = argument.slice(2);
    const value = rest[index + 1];
    const bare = !value || value.startsWith('--');
    accumulate(input, key, bare ? true : value, `'--${key}'`);
    if (!bare) index += 1;
  }
  return { operation, input };
}

function accumulate(
  input: Record<string, unknown>,
  key: string,
  value: unknown,
  source: string,
): void {
  if (!Object.prototype.hasOwnProperty.call(input, key)) {
    input[key] = value;
    return;
  }
  const existing = input[key];
  if (value === true || existing === true) {
    throw new ToolRuntimeError(
      'INVALID_INPUT',
      `${source} is given more than once, and one of them is a bare flag with no value to repeat`,
      TOOL_EXIT_CODES.usage,
    );
  }
  const values = (v: unknown): unknown[] => (Array.isArray(v) ? v : [v]);
  input[key] = [...values(existing), ...values(value)];
}

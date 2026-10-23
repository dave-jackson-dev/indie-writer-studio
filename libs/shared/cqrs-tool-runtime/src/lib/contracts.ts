export const TOOL_ENVELOPE_VERSION = '1.0.0' as const;

export type ToolOperationKind = 'command' | 'query';

/** Satisfied by NestJS's `CommandBus` and `QueryBus` as well as any test double. */
export interface ToolBus {
  execute(request: unknown): Promise<unknown>;
}

/**
 * A JSON Schema node, in the small subset the operation descriptors use. It documents what
 * `validate` accepts (and feeds the OpenAPI document); the runtime never reads it.
 */
export type OperationInputSchema = {
  readonly type: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array';
  readonly description?: string;
  readonly properties?: { readonly [name: string]: OperationInputSchema };
  readonly required?: readonly string[];
  readonly enum?: readonly (string | number)[];
  readonly items?: OperationInputSchema;
  readonly oneOf?: readonly OperationInputSchema[];
};

export interface ToolOperationDescriptor<TInput = Record<string, unknown>> {
  readonly name: string;
  readonly summary: string;
  readonly kind: ToolOperationKind;
  readonly createRequest: (input: TInput) => unknown;
  /** Turns raw transport input into the operation's typed input, or throws `invalidInput`. */
  readonly validate?: (input: Record<string, unknown>) => TInput;
  readonly inputSchema?: OperationInputSchema;
}

/** Erases an operation's input type so typed descriptors can share one list. */
export function defineOperation<TInput>(
  descriptor: ToolOperationDescriptor<TInput>,
): ToolOperationDescriptor {
  return descriptor as unknown as ToolOperationDescriptor;
}

export interface ToolErrorBody {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

export interface ToolEnvelope<T = unknown> {
  readonly schemaVersion: typeof TOOL_ENVELOPE_VERSION;
  readonly correlationId: string;
  readonly operation: string;
  readonly kind: ToolOperationKind | 'system';
  /**
   * Three outcomes, because there are three: `success`, `error`, and `incomplete`, a sequence that
   * stopped part-way. An incomplete run is not a softer error: it wants resuming or completing,
   * and `data` says what did and did not happen.
   */
  readonly status: 'success' | 'incomplete' | 'error';
  readonly exitCode: number;
  readonly data?: T;
  readonly error?: ToolErrorBody;
}

/** What a handler returns when part of what was asked for did not happen. */
export interface ResumableRun {
  readonly complete: boolean;
}

/** `complete: false` is a stop; an absent `complete` is not (most operations make no claim). */
export function isIncompleteRun(data: unknown): data is ResumableRun {
  return (
    typeof data === 'object' &&
    data !== null &&
    'complete' in data &&
    (data as ResumableRun).complete === false
  );
}

export interface ToolIo {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

export const TOOL_EXIT_CODES = {
  success: 0,
  failure: 1,
  usage: 2,
  conflict: 3,
  blocked: 4,
  notFound: 5,
  infrastructure: 10,
} as const;

/** HTTP status for an exit code (ADR-007 D4). */
export function httpStatusForExitCode(exitCode: number): number {
  switch (exitCode) {
    case TOOL_EXIT_CODES.usage:
      return 400;
    case TOOL_EXIT_CODES.conflict:
    case TOOL_EXIT_CODES.blocked:
      return 409;
    case TOOL_EXIT_CODES.notFound:
      return 404;
    case TOOL_EXIT_CODES.infrastructure:
      return 503;
    default:
      return 500;
  }
}

export class ToolRuntimeError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly exitCode: number = TOOL_EXIT_CODES.failure,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ToolRuntimeError';
  }
}

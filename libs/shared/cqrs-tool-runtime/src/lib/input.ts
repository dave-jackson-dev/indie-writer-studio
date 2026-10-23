import { TOOL_EXIT_CODES, ToolRuntimeError } from './contracts.js';

export function describeValue(value: unknown): string {
  if (value === undefined) return 'nothing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  return `a ${typeof value}`;
}

export function invalidInput(message: string): never {
  throw new ToolRuntimeError('INVALID_INPUT', message, TOOL_EXIT_CODES.usage);
}

export interface InputProbe {
  readonly input: Record<string, unknown>;
  readonly wasRead: (key: string) => boolean;
  readonly readKeys: () => readonly string[];
}

/**
 * Wraps the raw input so the runtime learns which keys `validate` looked at: the only honest
 * definition of what an operation accepts. Anything left unread is then refused by name.
 */
export function probeInput(received: Record<string, unknown>): InputProbe {
  const read = new Set<string>();
  const input = new Proxy(received, {
    get(target, property, receiver) {
      if (typeof property === 'string') read.add(property);
      return Reflect.get(target, property, receiver);
    },
    has(target, property) {
      if (typeof property === 'string') read.add(property);
      return Reflect.has(target, property);
    },
    ownKeys(target) {
      for (const key of Object.keys(target)) read.add(key);
      return Reflect.ownKeys(target);
    },
  });
  return { input, wasRead: (key) => read.has(key), readKeys: () => [...read] };
}

export function assertNoUnknownInput(
  operation: string,
  received: Record<string, unknown>,
  probe: InputProbe,
): void {
  const unknown = Object.keys(received).filter((key) => !probe.wasRead(key));
  if (unknown.length === 0) return;
  const quote = (key: string): string => `'${key}'`;
  const accepted = probe.readKeys().filter((key) => !unknown.includes(key));
  invalidInput(
    `${operation} does not accept ${unknown.map(quote).join(', ')}. ` +
      (accepted.length > 0
        ? `It accepts ${accepted.sort().map(quote).join(', ')}.`
        : 'It takes no arguments.'),
  );
}

export function requiredString(
  input: Record<string, unknown>,
  key: string,
  operation: string,
): string {
  const value = input[key];
  if (typeof value !== 'string' || value.trim() === '') {
    invalidInput(
      `${operation} needs a non-empty string '${key}'; received ${describeValue(value)}.`,
    );
  }
  return value as string;
}

export function optionalString(
  input: Record<string, unknown>,
  key: string,
  operation: string,
): string | undefined {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    invalidInput(
      `${operation}'s '${key}' must be a non-empty string when given; received ${describeValue(value)}.`,
    );
  }
  return value as string;
}

/** A string or an array of strings; a single value is promoted to a one-element array. */
export function optionalStringList(
  input: Record<string, unknown>,
  key: string,
  operation: string,
): string[] | undefined {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  const entries = Array.isArray(value) ? value : [value];
  return entries.map((entry, index) => {
    if (typeof entry !== 'string' || entry.trim() === '') {
      invalidInput(
        `${operation}'s '${key}' must hold non-empty strings; entry ${index} is ${describeValue(entry)}.`,
      );
    }
    return entry as string;
  });
}

export function optionalObjectList(
  input: Record<string, unknown>,
  key: string,
  operation: string,
): Record<string, unknown>[] | undefined {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) {
    invalidInput(`${operation}'s '${key}' must be an array; received ${describeValue(value)}.`);
  }
  return (value as unknown[]).map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      invalidInput(
        `${operation}'s '${key}[${index}]' must be an object; received ${describeValue(entry)}.`,
      );
    }
    return entry as Record<string, unknown>;
  });
}

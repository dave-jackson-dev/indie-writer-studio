/**
 * The test driver's control channel (ADR-004 D5): one JSON object per stdin line. Pure, so it can be
 * checked without Electron; the part that touches the window is in `driver.ts`.
 */
export type DriverLine =
  | { kind: 'blank' }
  | { kind: 'invalid'; message: string }
  | { kind: 'eval'; code: string; id: string | undefined }
  | {
      kind: 'request';
      operation: string;
      input: unknown;
      correlationId: string | undefined;
    };

export function parseDriverLine(line: string): DriverLine {
  if (line.trim() === '') return { kind: 'blank' };
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return { kind: 'invalid', message: 'The line is not valid JSON.' };
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { kind: 'invalid', message: 'The line must be a JSON object.' };
  }
  const { eval: code, id, operation, input, correlationId } = value as Record<string, unknown>;
  if (typeof code === 'string') {
    return { kind: 'eval', code, id: typeof id === 'string' ? id : undefined };
  }
  return {
    kind: 'request',
    operation: typeof operation === 'string' ? operation : '',
    input,
    correlationId: typeof correlationId === 'string' ? correlationId : undefined,
  };
}

/** The call the page runs through its own bridge, with every argument safely quoted as JSON. */
export function driverCall(line: Extract<DriverLine, { kind: 'request' }>): string {
  if (line.operation === 'help') {
    const topic = (line.input as { topic?: unknown } | undefined)?.topic;
    return `window.indieWriter.help(${typeof topic === 'string' ? JSON.stringify(topic) : 'undefined'})`;
  }
  const input = JSON.stringify(line.input ?? {});
  const options = JSON.stringify(
    line.correlationId === undefined ? {} : { correlationId: line.correlationId },
  );
  return `window.indieWriter.request(${JSON.stringify(line.operation)}, ${input}, ${options})`;
}

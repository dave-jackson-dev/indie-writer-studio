import { randomUUID } from 'node:crypto';

import { TOOL_ENVELOPE_VERSION, type ToolEnvelope } from '@indie-writer-studio/cqrs-tool-runtime';
import { Catch, HttpException, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Anything that escapes a route (a malformed JSON body, an oversized body, an unknown route) is
 * still answered with the shared envelope, so a client has exactly one error shape to handle.
 */
@Catch()
export class EnvelopeExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = statusOf(exception);
    const message = exception instanceof Error ? exception.message : 'Unknown failure';
    const code =
      status === 413
        ? 'PAYLOAD_TOO_LARGE'
        : status === 404
          ? 'NOT_FOUND'
          : status === 400 && /json/i.test(message)
            ? 'INVALID_JSON'
            : status >= 500
              ? 'HANDLER_FAILURE'
              : 'BAD_REQUEST';
    const envelope: ToolEnvelope = {
      schemaVersion: TOOL_ENVELOPE_VERSION,
      correlationId: randomUUID(),
      operation: 'http',
      kind: 'system',
      status: 'error',
      exitCode: status >= 500 ? 1 : 2,
      error: { code, message },
    };
    response.status(status).json(envelope);
  }
}

/** Nest's `HttpException`s, and body-parser errors (which carry a numeric `status`), keep their status. */
function statusOf(exception: unknown): number {
  if (exception instanceof HttpException) return exception.getStatus();
  const carried = (exception as { status?: unknown; statusCode?: unknown } | null) ?? {};
  const status = typeof carried.status === 'number' ? carried.status : carried.statusCode;
  return typeof status === 'number' && status >= 400 && status < 600 ? status : 500;
}

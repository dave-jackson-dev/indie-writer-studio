import {
  buildOpenApiDocument,
  httpStatusForExitCode,
  type CqrsToolRuntime,
  type ToolEnvelope,
} from '@indie-writer-studio/cqrs-tool-runtime';
import { Body, Controller, Get, Inject, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';

import { SERVICE_NAME, SERVICE_VERSION } from '../system.operations.js';

export const TOOL_RUNTIME = 'indie-writer.ToolRuntime';

/** 200 for success; otherwise from the envelope's exit code, with an unknown operation as 404. */
export function statusFor(envelope: ToolEnvelope): number {
  if (envelope.status === 'success') return 200;
  if (envelope.error?.code === 'UNKNOWN_OPERATION') return 404;
  return httpStatusForExitCode(envelope.exitCode);
}

/**
 * Generic dispatch over HTTP: one route for every operation rather than a route per operation
 * (the descriptors are the single source of truth). Every response body is the shared envelope.
 * `GET /health` is the gateway's probe route; it dispatches `system.health` like any other client.
 */
@Controller()
export class OperationsController {
  constructor(@Inject(TOOL_RUNTIME) private readonly runtime: CqrsToolRuntime) {}

  @Get('health')
  async health(@Res() response: Response): Promise<void> {
    const envelope = await this.runtime.dispatch('system.health', {});
    response.status(statusFor(envelope)).json(envelope);
  }

  @Get('operations')
  list(@Res() response: Response): void {
    response.status(200).json(this.runtime.helpEnvelope());
  }

  @Get('operations/:name')
  describe(@Param('name') name: string, @Res() response: Response): void {
    const envelope = this.runtime.helpEnvelope(undefined, name);
    response.status(statusFor(envelope)).json(envelope);
  }

  @Get('openapi.json')
  openapi(@Res() response: Response): void {
    response.status(200).json(
      buildOpenApiDocument(this.runtime.describeOperations(), {
        title: SERVICE_NAME,
        version: SERVICE_VERSION,
        description: 'IndieWriter Studio composition root. Every response is the shared envelope.',
      }),
    );
  }

  @Post('operations/:name')
  async dispatch(
    @Param('name') name: string,
    @Body() body: unknown,
    @Res() response: Response,
  ): Promise<void> {
    const envelope = await this.runtime.dispatch(name, (body ?? {}) as Record<string, unknown>);
    response.status(statusFor(envelope)).json(envelope);
  }
}

import 'reflect-metadata';

import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import { TOOL_ENVELOPE_VERSION, type ToolEnvelope } from '@indie-writer-studio/cqrs-tool-runtime';

import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

import { EnvelopeExceptionFilter } from './envelope-exception.filter.js';
import { COMPONENTS } from '../components.js';
import { HttpModule } from './http.module.js';

export interface HttpOptions {
  /** Default 127.0.0.1: the API guards authors' works, so it is not exposed to the network by default. */
  host?: string;
  /** Default 4810; 0 picks a free port. */
  port?: number;
  /** Extra allowed CORS origins, beside any localhost or 127.0.0.1 origin. */
  corsOrigins?: string[];
}

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

const refusal = (code: string): ToolEnvelope => ({
  schemaVersion: TOOL_ENVELOPE_VERSION,
  correlationId: randomUUID(),
  operation: 'http',
  kind: 'system',
  status: 'error',
  exitCode: 2,
  error: { code, message: 'Request refused: origin or host is not allowed.' },
});

export interface RunningServer {
  url: string;
  app: INestApplication;
  close: () => Promise<void>;
}

/** Starts the HTTP transport and resolves once it is listening. */
export async function startHttpServer(options: HttpOptions = {}): Promise<RunningServer> {
  const app = await NestFactory.create<NestExpressApplication>(
    HttpModule.forComponents(COMPONENTS),
    { logger: ['error'] },
  );
  const allowed = options.corsOrigins ?? [];
  const host = options.host ?? '127.0.0.1';
  const originAllowed = (origin: string | undefined): boolean =>
    origin === undefined || LOCAL_ORIGIN.test(origin) || allowed.includes(origin);
  // 🔴 CORS only hides a response from a page; the request still runs. A cross-site form POST
  // needs no preflight, so a disallowed Origin is refused before any route sees it, and (while
  // bound to loopback) so is a Host that is not loopback, which is how DNS rebinding arrives.
  app.use((request: Request, response: Response, next: NextFunction) => {
    const hostOk = !LOOPBACK_HOSTS.has(host) || LOCAL_HOST.test(request.headers.host ?? '');
    if (originAllowed(request.headers.origin) && hostOk) return next();
    response.status(403).json(refusal(hostOk ? 'FORBIDDEN_ORIGIN' : 'FORBIDDEN_HOST'));
  });
  app.enableCors({
    origin: (origin, callback) => callback(null, originAllowed(origin)),
  });
  app.useBodyParser('json', { limit: '1mb' });
  app.useGlobalFilters(new EnvelopeExceptionFilter());
  await app.listen(options.port ?? 4810, host);
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { url: `http://${host}:${port}`, app, close: () => app.close() };
}

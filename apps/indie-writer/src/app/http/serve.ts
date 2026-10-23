import 'reflect-metadata';

import type { AddressInfo } from 'node:net';

import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

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
  app.enableCors({
    origin: (origin, callback) =>
      callback(null, origin === undefined || LOCAL_ORIGIN.test(origin) || allowed.includes(origin)),
  });
  app.useBodyParser('json', { limit: '1mb' });
  app.useGlobalFilters(new EnvelopeExceptionFilter());
  const host = options.host ?? '127.0.0.1';
  await app.listen(options.port ?? 4810, host);
  const { port } = app.getHttpServer().address() as AddressInfo;
  return { url: `http://${host}:${port}`, app, close: () => app.close() };
}

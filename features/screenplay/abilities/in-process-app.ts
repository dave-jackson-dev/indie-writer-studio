import 'reflect-metadata';

import { CqrsToolRuntime } from '@indie-writer-studio/cqrs-tool-runtime';
import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CommandBus, QueryBus } from '@nestjs/cqrs';

import { AppModule } from '../../../apps/indie-writer/src/app/app.module.ts';
import { createComponents } from '../../../apps/indie-writer/src/app/components.ts';
import { operationsFor } from '../../../apps/indie-writer/src/app/operations.ts';
import type { Envelope, OperateApp } from './operate-app.ts';

/** Domain-tier assembly: the real Nest buses and handlers, no transport in between. */
export class InProcessApp implements OperateApp {
  readonly assembly = 'in-process';
  private context: INestApplicationContext | undefined;
  private runtime: CqrsToolRuntime | undefined;

  constructor(private readonly dataDir: string) {}

  private async start(): Promise<CqrsToolRuntime> {
    if (this.runtime) return this.runtime;
    const components = createComponents({ dataDir: this.dataDir });
    this.context = await NestFactory.createApplicationContext(AppModule.forComponents(components), {
      logger: false,
    });
    this.runtime = new CqrsToolRuntime({
      commandBus: this.context.get(CommandBus),
      queryBus: this.context.get(QueryBus),
      operations: operationsFor(components),
    });
    return this.runtime;
  }

  async invoke(operation: string, input: Record<string, unknown> = {}): Promise<Envelope> {
    return (await (await this.start()).dispatch(operation, input)) as Envelope;
  }

  async restart(): Promise<void> {
    await this.close();
  }

  async close(): Promise<void> {
    await this.context?.close();
    this.context = undefined;
    this.runtime = undefined;
  }
}

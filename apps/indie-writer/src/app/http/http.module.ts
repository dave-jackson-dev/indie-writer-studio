import { CqrsToolRuntime } from '@indie-writer-studio/cqrs-tool-runtime';
import { Module, type DynamicModule } from '@nestjs/common';
import { CommandBus, CqrsModule, QueryBus } from '@nestjs/cqrs';

import { AppModule } from '../app.module.js';
import { COMPONENTS, type Component } from '../components.js';
import { operationsFor } from '../operations.js';
import { OperationsController, TOOL_RUNTIME } from './operations.controller.js';

@Module({})
export class HttpModule {
  static forComponents(components: readonly Component[] = COMPONENTS): DynamicModule {
    return {
      module: HttpModule,
      imports: [CqrsModule, AppModule.forComponents(components)],
      controllers: [OperationsController],
      providers: [
        {
          provide: TOOL_RUNTIME,
          inject: [CommandBus, QueryBus],
          useFactory: (commandBus: CommandBus, queryBus: QueryBus) =>
            new CqrsToolRuntime({
              commandBus,
              queryBus,
              operations: operationsFor(components),
            }),
        },
      ],
    };
  }
}

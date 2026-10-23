import {
  CLOCK,
  ID_GENERATOR,
  WORK_REPOSITORY,
  WORKS_HANDLERS,
} from '@indie-writer-studio/works-application';
import { Module, type DynamicModule } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { InMemoryWorkRepository } from './in-memory-work-repository.js';
import { JsonFileWorkRepository } from './json-file-work-repository.js';
import { SystemClock, UuidGenerator } from './system-adapters.js';

export interface WorksModuleOptions {
  /** Where works are kept. Without one, they live in memory and vanish on exit. */
  readonly dataDir?: string | undefined;
}

/** The real adapters behind every port the works handlers depend on. */
@Module({})
export class WorksModule {
  static register(options: WorksModuleOptions = {}): DynamicModule {
    return {
      module: WorksModule,
      imports: [CqrsModule],
      providers: [
        ...WORKS_HANDLERS,
        {
          provide: WORK_REPOSITORY,
          useValue:
            options.dataDir === undefined
              ? new InMemoryWorkRepository()
              : new JsonFileWorkRepository(options.dataDir),
        },
        { provide: ID_GENERATOR, useValue: new UuidGenerator() },
        { provide: CLOCK, useValue: new SystemClock() },
      ],
    };
  }
}

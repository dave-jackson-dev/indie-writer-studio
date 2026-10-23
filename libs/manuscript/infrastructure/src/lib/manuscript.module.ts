import {
  MANUSCRIPT_CLOCK,
  MANUSCRIPT_HANDLERS,
  MANUSCRIPT_ID_GENERATOR,
  MANUSCRIPT_REPOSITORY,
} from '@indie-writer-studio/manuscript-application';
import { Module, type DynamicModule } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { InMemoryManuscriptRepository } from './in-memory-manuscript-repository.js';
import { JsonFileManuscriptRepository } from './json-file-manuscript-repository.js';
import { SystemClock, UuidGenerator } from './system-adapters.js';

export interface ManuscriptModuleOptions {
  /** Where manuscripts are kept. Without one, they live in memory and vanish on exit. */
  readonly dataDir?: string | undefined;
}

/** The real adapters behind every port the manuscript handlers depend on. */
@Module({})
export class ManuscriptModule {
  static register(options: ManuscriptModuleOptions = {}): DynamicModule {
    return {
      module: ManuscriptModule,
      imports: [CqrsModule],
      providers: [
        ...MANUSCRIPT_HANDLERS,
        {
          provide: MANUSCRIPT_REPOSITORY,
          useValue:
            options.dataDir === undefined
              ? new InMemoryManuscriptRepository()
              : new JsonFileManuscriptRepository(options.dataDir),
        },
        { provide: MANUSCRIPT_ID_GENERATOR, useValue: new UuidGenerator() },
        { provide: MANUSCRIPT_CLOCK, useValue: new SystemClock() },
      ],
    };
  }
}

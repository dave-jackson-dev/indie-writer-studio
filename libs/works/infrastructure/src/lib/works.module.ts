import {
  CLOCK,
  ID_GENERATOR,
  WORK_REPOSITORY,
  WORKS_HANDLERS,
} from '@indie-writer-studio/works-application';
import {
  CASCADE_HOOKS,
  TYPEDBLITE_DATABASE,
  type CascadeHooks,
  type Database,
} from '@indie-writer-studio/typedblite';
import { Module, type DynamicModule } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { SystemClock, UuidGenerator } from './system-adapters.js';
import { TypeDBLiteWorkRepository } from './typedblite-work-repository.js';

/**
 * The works handlers over the shared database. The database itself is provided by the application
 * (`TypeDBLiteModule`), with `WORKS_SCHEMA` among its schemas.
 */
@Module({})
export class WorksModule {
  static register(): DynamicModule {
    return {
      module: WorksModule,
      imports: [CqrsModule],
      providers: [
        ...WORKS_HANDLERS,
        {
          provide: WORK_REPOSITORY,
          inject: [TYPEDBLITE_DATABASE, CASCADE_HOOKS],
          useFactory: (database: Database, hooks: CascadeHooks) =>
            new TypeDBLiteWorkRepository(database, hooks),
        },
        { provide: ID_GENERATOR, useValue: new UuidGenerator() },
        { provide: CLOCK, useValue: new SystemClock() },
      ],
    };
  }
}

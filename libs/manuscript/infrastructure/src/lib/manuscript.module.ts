import {
  MANUSCRIPT_HANDLERS,
  MANUSCRIPT_ID_GENERATOR,
  MANUSCRIPT_REPOSITORY,
} from '@indie-writer-studio/manuscript-application';
import {
  CASCADE_HOOKS,
  TYPEDBLITE_DATABASE,
  type CascadeHooks,
  type Database,
} from '@indie-writer-studio/typedblite';
import { Module, type DynamicModule } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { UuidGenerator } from './system-adapters.js';
import { TypeDBLiteManuscriptRepository } from './typedblite-manuscript-repository.js';

/**
 * The manuscript handlers over the shared database. The database itself is provided by the
 * application (`TypeDBLiteModule`), with `MANUSCRIPT_SCHEMA` after `WORKS_SCHEMA` among its schemas.
 */
@Module({})
export class ManuscriptModule {
  static register(): DynamicModule {
    return {
      module: ManuscriptModule,
      imports: [CqrsModule],
      providers: [
        ...MANUSCRIPT_HANDLERS,
        {
          provide: MANUSCRIPT_REPOSITORY,
          inject: [TYPEDBLITE_DATABASE, CASCADE_HOOKS],
          useFactory: (database: Database, hooks: CascadeHooks) =>
            new TypeDBLiteManuscriptRepository(database, hooks),
        },
        { provide: MANUSCRIPT_ID_GENERATOR, useValue: new UuidGenerator() },
      ],
    };
  }
}

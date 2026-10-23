import { Global, Module, type DynamicModule } from '@nestjs/common';

import { CascadeHooks } from './cascade.js';
import { Database, type DatabaseOptions } from './database.js';

export const TYPEDBLITE_DATABASE = 'typedblite.Database';
export const CASCADE_HOOKS = 'typedblite.CascadeHooks';

/**
 * The one database the application shares, and the cascade hooks its components use to clean up
 * after each other. Global, so a component declares what it needs without importing the others.
 *
 * Import the very same registration (the same object) wherever it is needed: Nest then builds it
 * once.
 */
@Global()
@Module({})
export class TypeDBLiteModule {
  static register(options: DatabaseOptions): DynamicModule {
    return {
      module: TypeDBLiteModule,
      providers: [
        { provide: TYPEDBLITE_DATABASE, useFactory: () => Database.open(options) },
        { provide: CASCADE_HOOKS, useValue: new CascadeHooks() },
      ],
      exports: [TYPEDBLITE_DATABASE, CASCADE_HOOKS],
    };
  }
}

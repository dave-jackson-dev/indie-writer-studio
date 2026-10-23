import { Module, type DynamicModule } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { COMPONENTS, type Component } from './components.js';
import { GetHealthHandler } from './system.operations.js';

/** The composition root: every transport dispatches the operations this module's buses serve. */
@Module({})
export class AppModule {
  static forComponents(components: readonly Component[] = COMPONENTS): DynamicModule {
    return {
      module: AppModule,
      imports: [CqrsModule, ...components.map((component) => component.module)],
      providers: [GetHealthHandler],
    };
  }
}

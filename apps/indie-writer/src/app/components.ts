import { join } from 'node:path';

import type { ToolOperationDescriptor } from '@indie-writer-studio/cqrs-tool-runtime';
import { createManuscriptToolOperations } from '@indie-writer-studio/manuscript-application';
import {
  MANUSCRIPT_SCHEMA,
  ManuscriptModule,
} from '@indie-writer-studio/manuscript-infrastructure';
import { TypeDBLiteModule } from '@indie-writer-studio/typedblite';
import { createWorksToolOperations } from '@indie-writer-studio/works-application';
import { WORKS_SCHEMA, WorksModule } from '@indie-writer-studio/works-infrastructure';
import type { DynamicModule, Type } from '@nestjs/common';

/**
 * A standalone CQRS app that `indie-writer` composes, the way `mvp` composes `scm`, `skills` and
 * the rest: the root imports the component's Nest module (its handlers) and concatenates its
 * operation descriptors unchanged. Each descriptor keeps its own `validate` and `createRequest`, so
 * there is no code between a transport and the component's own descriptor and therefore no place
 * for an argument shape to drift.
 */
export interface Component {
  readonly name: string;
  readonly module: Type<unknown> | DynamicModule;
  readonly operations: () => readonly ToolOperationDescriptor[];
  /**
   * Modules the application must provide for this component, such as the shared database. The very
   * same object listed by several components is built once.
   */
  readonly requires?: readonly DynamicModule[];
}

export interface ComponentsConfig {
  /** Where components keep their data. Absent means in memory, which is gone on exit. */
  readonly dataDir?: string | undefined;
}

const DATABASE_FILE = 'indie-writer.db';

/** `INDIE_WRITER_DATA_DIR`, else `.indie-writer` in the directory the app was started from. */
const defaultConfig = (): ComponentsConfig => ({
  dataDir: process.env['INDIE_WRITER_DATA_DIR'] ?? join(process.cwd(), '.indie-writer'),
});

/**
 * Every component the root composes, over one shared database (ADR-003). Pass `{}` for a database
 * in memory (SQLite's `:memory:`, the same engine and the same constraints), as tests do.
 */
export function createComponents(config: ComponentsConfig = defaultConfig()): readonly Component[] {
  const database = TypeDBLiteModule.register({
    location: config.dataDir === undefined ? ':memory:' : join(config.dataDir, DATABASE_FILE),
    // In dependency order: the manuscript's schema refers to the works catalog's `work`.
    schemas: [WORKS_SCHEMA, MANUSCRIPT_SCHEMA],
  });
  return [
    {
      name: 'works',
      module: WorksModule.register(),
      operations: createWorksToolOperations,
      requires: [database],
    },
    {
      name: 'manuscript',
      module: ManuscriptModule.register(),
      operations: createManuscriptToolOperations,
      requires: [database],
    },
  ];
}

export const COMPONENTS: readonly Component[] = createComponents();

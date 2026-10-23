import { join } from 'node:path';

import type { ToolOperationDescriptor } from '@indie-writer-studio/cqrs-tool-runtime';
import { createWorksToolOperations } from '@indie-writer-studio/works-application';
import { WorksModule } from '@indie-writer-studio/works-infrastructure';
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
}

export interface ComponentsConfig {
  /** Where components keep their data. Absent means in memory, which is gone on exit. */
  readonly dataDir?: string | undefined;
}

/** `INDIE_WRITER_DATA_DIR`, else `.indie-writer` in the directory the app was started from. */
const defaultConfig = (): ComponentsConfig => ({
  dataDir: process.env['INDIE_WRITER_DATA_DIR'] ?? join(process.cwd(), '.indie-writer'),
});

/** Every component the root composes. Pass `{}` for an all-in-memory root (tests). */
export function createComponents(config: ComponentsConfig = defaultConfig()): readonly Component[] {
  return [
    {
      name: 'works',
      module: WorksModule.register({ dataDir: config.dataDir }),
      operations: createWorksToolOperations,
    },
  ];
}

export const COMPONENTS: readonly Component[] = createComponents();

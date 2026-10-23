import type { ToolOperationDescriptor } from '@indie-writer-studio/cqrs-tool-runtime';
import type { Type } from '@nestjs/common';

/**
 * A standalone CQRS app that `indie-writer` composes, the way `mvp` composes `scm`, `skills` and
 * the rest: the root imports the component's Nest module (its handlers) and concatenates its
 * operation descriptors unchanged. Each descriptor keeps its own `validate` and `createRequest`, so
 * there is no code between a transport and the component's own descriptor and therefore no place
 * for an argument shape to drift.
 */
export interface Component {
  readonly name: string;
  readonly module: Type<unknown>;
  readonly operations: () => readonly ToolOperationDescriptor[];
}

/** Every component the root composes. Empty until the first one lands. */
export const COMPONENTS: readonly Component[] = [];

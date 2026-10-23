import type { ToolOperationDescriptor } from '@indie-writer-studio/cqrs-tool-runtime';

import { COMPONENTS, type Component } from './components.js';
import { createSystemOperations } from './system.operations.js';

/**
 * The operation list every transport exposes.
 *
 * 🔴 **One list, built in one place.** CLI, REPL, sidecar and HTTP all call this, so `--help` and
 * `GET /operations` cannot disagree about what the app can do.
 */
export const operationsFor = (
  components: readonly Component[] = COMPONENTS,
): readonly ToolOperationDescriptor[] => [
  ...createSystemOperations(components.map((component) => component.name)),
  ...components.flatMap((component) => component.operations()),
];

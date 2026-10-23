import { defineConfig } from 'vitest/config';

import { testDefaults, workspaceAliases } from '../../../vitest.shared';

export default defineConfig({
  resolve: { alias: workspaceAliases() },
  test: { ...testDefaults('cqrs-tool-runtime'), include: ['src/**/*.spec.ts'] },
});

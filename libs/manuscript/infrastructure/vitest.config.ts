import { defineConfig } from 'vitest/config';

import { testDefaults, workspaceAliases } from '../../../vitest.shared';

export default defineConfig({
  resolve: { alias: workspaceAliases() },
  test: { ...testDefaults('manuscript-infrastructure'), include: ['src/**/*.spec.ts'] },
});

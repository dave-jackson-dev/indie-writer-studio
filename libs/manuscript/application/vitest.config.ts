import { defineConfig } from 'vitest/config';

import { testDefaults, workspaceAliases } from '../../../vitest.shared';

export default defineConfig({
  resolve: { alias: workspaceAliases() },
  test: { ...testDefaults('manuscript-application'), include: ['src/**/*.spec.ts'] },
});

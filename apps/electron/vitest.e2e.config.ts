import { defineConfig } from 'vitest/config';

import { testDefaults, workspaceAliases } from '../../vitest.shared';

export default defineConfig({
  resolve: { alias: workspaceAliases() },
  test: {
    ...testDefaults('electron-e2e'),
    include: ['e2e/**/*.e2e.ts'],
    testTimeout: 90000,
    hookTimeout: 90000,
  },
});

import { defineConfig } from 'vitest/config';

import { testDefaults, workspaceAliases } from '../../vitest.shared';

export default defineConfig({
  resolve: { alias: workspaceAliases() },
  test: {
    ...testDefaults('electron-e2e'),
    include: ['e2e/**/*.e2e.ts'],
    // One Electron at a time: two `xvfb-run -a` started together can race for the same display.
    fileParallelism: false,
    testTimeout: 90000,
    hookTimeout: 90000,
  },
});

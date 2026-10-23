import { defineConfig } from 'vitest/config';

import { testDefaults, workspaceAliases } from '../../vitest.shared';

export default defineConfig({
  resolve: { alias: workspaceAliases() },
  test: { ...testDefaults('typedblite-vendor'), include: ['src/**/*.spec.ts'], testTimeout: 30000 },
});

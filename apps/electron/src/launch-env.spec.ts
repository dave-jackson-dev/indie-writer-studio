import { describe, expect, it } from 'vitest';

import { DEFAULT_GTK_TEXT_SCALE, electronEnv } from './launch-env.js';

describe('electronEnv', () => {
  it('removes ELECTRON_RUN_AS_NODE, which makes the binary behave as plain Node', () => {
    expect(electronEnv({ ELECTRON_RUN_AS_NODE: '1', PATH: '/bin' })).not.toHaveProperty(
      'ELECTRON_RUN_AS_NODE',
    );
  });

  it('removes NODE_OPTIONS, whose flags Electron rejects', () => {
    expect(electronEnv({ NODE_OPTIONS: '--use-openssl-ca', PATH: '/bin' })).not.toHaveProperty(
      'NODE_OPTIONS',
    );
  });

  it('keeps everything else, and does not change the environment it was given', () => {
    const given = { ELECTRON_RUN_AS_NODE: '1', PATH: '/bin', HOME: '/h' };
    expect(electronEnv(given)).toMatchObject({ PATH: '/bin', HOME: '/h' });
    expect(given.ELECTRON_RUN_AS_NODE).toBe('1');
  });

  it('sets a readable text scale for GTK unless the user already chose one', () => {
    expect(electronEnv({}).GDK_DPI_SCALE).toBe(DEFAULT_GTK_TEXT_SCALE);
    expect(electronEnv({ GDK_DPI_SCALE: '1' }).GDK_DPI_SCALE).toBe('1');
  });
});

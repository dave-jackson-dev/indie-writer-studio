import { describe, expect, it } from 'vitest';

import { launchCommand } from './launcher.js';

const base = { electronPath: '/e/electron', appDir: '/d', args: ['--ipc-driver'] };

describe('launchCommand', () => {
  it('runs Electron under a virtual display when a Linux machine has none, and without the sandbox as root', () => {
    expect(launchCommand({ ...base, platform: 'linux', display: undefined, uid: 0 })).toEqual({
      command: 'xvfb-run',
      args: ['-a', '/e/electron', '/d', '--no-sandbox', '--ipc-driver'],
    });
  });

  it('runs Electron directly on a Linux desktop with a display, and keeps the sandbox for a normal user', () => {
    expect(launchCommand({ ...base, platform: 'linux', display: ':0', uid: 1000 })).toEqual({
      command: '/e/electron',
      args: ['/d', '--ipc-driver'],
    });
  });

  it('drops the sandbox for root even with a display, because Chromium refuses it there', () => {
    expect(launchCommand({ ...base, platform: 'linux', display: ':0', uid: 0 }).args).toContain(
      '--no-sandbox',
    );
  });

  it('never wraps or changes anything on macOS or Windows', () => {
    for (const platform of ['darwin', 'win32'] as const) {
      expect(launchCommand({ ...base, platform, display: undefined, uid: 0 })).toEqual({
        command: '/e/electron',
        args: ['/d', '--ipc-driver'],
      });
    }
  });

  it('puts the app’s own arguments after the ones Electron needs', () => {
    const { args } = launchCommand({
      ...base,
      args: ['--smoke', '--x'],
      platform: 'linux',
      display: undefined,
      uid: 0,
    });
    expect(args.slice(-2)).toEqual(['--smoke', '--x']);
  });
});

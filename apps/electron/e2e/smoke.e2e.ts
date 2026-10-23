import { afterEach, describe, expect, it } from 'vitest';

import { launch, type Running } from './launch.js';

let app: Running | undefined;
afterEach(async () => {
  if (app) {
    app.child.kill('SIGKILL');
    app = undefined;
  }
});

describe('the Electron shell (smoke)', () => {
  it('opens a window on the shipped page, boots the host, and gives the page only the two bridge functions', async () => {
    app = launch(['--smoke']);
    const smoke = await app.next((line) => line.event === 'smoke');
    expect(smoke.electron).toMatch(/^44\./);
    expect(smoke.node).toMatch(/^24\./);
    expect(smoke.hostBooted).toBe(true);
    expect(smoke.title).toBe('IndieWriter Studio');
    expect(smoke.bridge).toBe('help,request');
  });

  it('keeps Node, require and raw IPC out of the page', async () => {
    app = launch(['--smoke']);
    const smoke = await app.next((line) => line.event === 'smoke');
    expect(smoke.rendererGlobals).toEqual({
      require: 'undefined',
      process: 'undefined',
      module: 'undefined',
      ipcRenderer: 'undefined',
    });
  });

  it('quits by itself after reporting', async () => {
    app = launch(['--smoke']);
    await app.next((line) => line.event === 'smoke');
    expect(await app.exit()).toBe(0);
    app = undefined;
  });
});

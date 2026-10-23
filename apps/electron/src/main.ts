import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { app, BrowserWindow, dialog, ipcMain, Menu } from 'electron';

import { reportSmoke, runIpcDriver } from './driver.js';
import { bootHost, type Host } from './host.js';
import { registerIpcTransport } from './ipc/handler.js';
import { buildMenuTemplate } from './menu.js';
import { keepSingleInstance } from './single-instance.js';
import { openMainWindow } from './window.js';

const rendererDir = fileURLToPath(new URL('./renderer', import.meta.url));
const preloadPath = fileURLToPath(new URL('./preload.cjs', import.meta.url));
const development = !app.isPackaged;
// Test driver modes exist only in an unpackaged build; the driver is a control channel on stdin.
const smoke = development && process.argv.includes('--smoke');
const ipcDriver = development && process.argv.includes('--ipc-driver');

app.setName('IndieWriter Studio');

let window: BrowserWindow | undefined;
let host: Host | undefined;

const focusWindow = (): void => {
  if (window === undefined) return;
  if (window.isMinimized()) window.restore();
  window.focus();
};

if (keepSingleInstance(app, focusWindow)) {
  // Not a top-level `await`: Electron emits `ready` only after the entry module has finished evaluating.
  void app.whenReady().then(start).catch(failStart);
}

function failStart(error: unknown): void {
  console.error('IndieWriter Studio could not start', error);
  dialog.showErrorBox('IndieWriter Studio could not start', String(error));
  app.exit(1);
}

async function start(): Promise<void> {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate(
      buildMenuTemplate({ platform: process.platform, appName: app.name, development }),
    ),
  );
  // The author's data lives in the user-data folder. A test driver keeps it in memory unless it is
  // told where, so a test never touches a real author's works.
  const harness = smoke || ipcDriver;
  const dataDir =
    process.env['INDIE_WRITER_DATA_DIR'] ??
    (harness ? undefined : join(app.getPath('userData'), 'data'));
  host = await bootHost({ dataDir });
  registerIpcTransport(ipcMain, host.runtime, rendererDir);
  const open = (show: boolean): void => {
    const opened = openMainWindow(rendererDir, { preload: preloadPath, show });
    window = opened;
    opened.on('closed', () => {
      if (window === opened) window = undefined;
    });
  };
  open(!ipcDriver);
  if (window !== undefined && smoke) void reportSmoke(window, host !== undefined);
  if (window !== undefined && ipcDriver) void runIpcDriver(window);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      open(true);
    }
  });
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
  app.once('will-quit', (event) => {
    if (host === undefined) return;
    event.preventDefault();
    const closing = host;
    host = undefined;
    // `app.quit()` from inside a prevented `will-quit` does not finish quitting; windows are gone by now, so exit.
    closing.close().then(
      () => app.exit(0),
      (error: unknown) => {
        console.error('IndieWriter Studio: the database did not close cleanly', error);
        app.exit(1);
      },
    );
  });
}

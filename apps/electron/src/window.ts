import { BrowserWindow } from 'electron';

import { isAllowedNavigation, rendererPreferences } from './security.js';

export interface WindowOptions {
  /** The sandboxed preload script that exposes the bridge. */
  preload?: string;
  /** False keeps the window hidden (the test driver). */
  show?: boolean;
}

/** Opens the main window on the renderer's entry page, under ADR-004's security defaults. */
export function openMainWindow(
  rendererDir: string,
  { preload, show = true }: WindowOptions = {},
): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    webPreferences: rendererPreferences(preload),
  });
  if (show) window.once('ready-to-show', () => window.show());

  // A page may only move within the shipped renderer, and may not open windows of its own.
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, rendererDir)) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  void window.loadFile(`${rendererDir}/index.html`);
  return window;
}

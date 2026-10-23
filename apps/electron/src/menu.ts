import type { MenuItemConstructorOptions } from 'electron';

export interface MenuContext {
  platform: NodeJS.Platform;
  appName: string;
  /** Developer tools and reload are offered only to a development build. */
  development: boolean;
}

/**
 * The native application menu as data (ADR-004 D7): the operating system's standard window and
 * clipboard commands, and nothing of the app's own. Every in-window command lives in the renderer.
 */
export function buildMenuTemplate({
  platform,
  appName,
  development,
}: MenuContext): MenuItemConstructorOptions[] {
  const mac = platform === 'darwin';
  const view: MenuItemConstructorOptions[] = [
    { role: 'resetZoom' },
    { role: 'zoomIn' },
    { role: 'zoomOut' },
    { type: 'separator' },
    { role: 'togglefullscreen' },
    ...(development
      ? ([
          { type: 'separator' },
          { role: 'reload' },
          { role: 'toggleDevTools' },
        ] satisfies MenuItemConstructorOptions[])
      : []),
  ];
  return [
    ...(mac
      ? ([
          {
            label: appName,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ] satisfies MenuItemConstructorOptions[])
      : []),
    { label: 'File', submenu: [mac ? { role: 'close' } : { role: 'quit' }] },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    { label: 'View', submenu: view },
    { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'zoom' }, { role: 'close' }] },
  ];
}

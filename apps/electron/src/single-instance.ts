export interface InstanceApp {
  requestSingleInstanceLock(): boolean;
  quit(): void;
  on(event: 'second-instance', listener: () => void): unknown;
}

/**
 * One running copy of the app: a second launch quits at once and the first one comes to the front.
 * Returns whether this process is the one that stays.
 */
export function keepSingleInstance(app: InstanceApp, focusExisting: () => void): boolean {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return false;
  }
  app.on('second-instance', focusExisting);
  return true;
}

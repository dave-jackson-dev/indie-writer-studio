import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _electron, type ElectronApplication, type Page } from 'playwright-core';

import { electronEnv } from '../../../apps/electron/src/launch-env.ts';

const here = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(here, '../../../dist/apps/electron');

/**
 * Screenplay ability: the Author can see and use the Writer window. The built Electron app is run
 * for real, on a data folder the scenario owns, and driven through its page the way a person would
 * (clicks and typing), never through the bridge.
 */
export class OperateWindow {
  private application: ElectronApplication | undefined;
  private current: Page | undefined;

  constructor(private readonly dataDir: string) {}

  /** The window's page, once the Writer has been opened. */
  get page(): Page {
    if (!this.current) throw new Error('The Writer has not been opened in this scenario.');
    return this.current;
  }

  async open(): Promise<void> {
    const electronPath = createRequire(import.meta.url)('electron') as string;
    // As root (a container) Chromium refuses to start without --no-sandbox; a person's account does not need it.
    const root = (process.getuid?.() ?? 1) === 0;
    this.application = await _electron.launch({
      executablePath: electronPath,
      args: [...(root ? ['--no-sandbox'] : []), APP_DIR],
      env: { ...electronEnv(process.env), INDIE_WRITER_DATA_DIR: this.dataDir } as Record<
        string,
        string
      >,
      timeout: 60_000,
    });
    this.current = await this.application.firstWindow();
    await this.current.waitForLoadState('domcontentloaded');
  }

  /** Closes the window the way the Author would, and waits for the app to end. */
  async close(): Promise<void> {
    const application = this.application;
    this.application = undefined;
    this.current = undefined;
    if (!application) return;
    const pid = application.process().pid;
    try {
      await application.evaluate(({ app }) => app.quit());
    } catch {
      // the app may already be going away
    }
    const ended = await Promise.race([
      application.waitForEvent('close').then(() => true),
      new Promise<boolean>((done) => setTimeout(() => done(false), 15_000)),
    ]);
    // Only an app that would not end is killed; a pid that has ended may belong to something else by now.
    if (!ended && pid !== undefined) spawnSync('kill', ['-9', String(pid)]);
  }
}

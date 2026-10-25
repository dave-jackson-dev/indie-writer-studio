import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  After,
  Before,
  defineParameterType,
  setDefaultTimeout,
  setWorldConstructor,
  type IWorldOptions,
} from '@cucumber/cucumber';
import { ActorParameterType, ActorWorld } from '@cucumber/screenplay';

import { OperateWindow } from '../screenplay/abilities/operate-window.ts';

defineParameterType(ActorParameterType);

// A step may wait for the window to launch.
setDefaultTimeout(90_000);

/** The World of the window suite: one data folder, and the ability to see and use the Writer window. */
export class WriterWorld extends ActorWorld {
  dataDir = '';
  window!: OperateWindow;

  constructor(options: IWorldOptions) {
    super({ ...options, packageType: 'module' });
  }

  async prepare(): Promise<void> {
    this.dataDir = await mkdtemp(join(tmpdir(), 'indie-writer-window-'));
    this.window = new OperateWindow(this.dataDir);
  }

  async dispose(): Promise<void> {
    await this.window?.close();
    if (this.dataDir) await rm(this.dataDir, { recursive: true, force: true });
  }
}

setWorldConstructor(WriterWorld);

Before(async function (this: WriterWorld) {
  await this.prepare();
});

After(async function (this: WriterWorld) {
  await this.dispose();
});

export const AUTHOR = 'Ada';

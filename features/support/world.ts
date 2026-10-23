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

import { BinaryApp, type BinaryTransport } from '../screenplay/abilities/binary-app.ts';
import { InProcessApp } from '../screenplay/abilities/in-process-app.ts';
import type { Envelope, OperateApp } from '../screenplay/abilities/operate-app.ts';

defineParameterType(ActorParameterType);

// A step may start several processes when the app is reached over the CLI.
setDefaultTimeout(60_000);

const ASSEMBLY = process.env['IWS_ASSEMBLY'] ?? 'in-process';

/**
 * The World holds what the Author can operate (the ability) and what the last operation answered.
 * Which assembly backs the ability is chosen outside the scenarios: `IWS_ASSEMBLY` is `in-process`
 * (default), `cli`, `repl`, `sidecar` or `http`.
 */
export class IndieWriterWorld extends ActorWorld {
  app!: OperateApp;
  dataDir = '';
  /** What the most recent operation answered. */
  lastEnvelope: Envelope | undefined;

  constructor(options: IWorldOptions) {
    super({ ...options, packageType: 'module' });
  }

  async open(): Promise<void> {
    this.dataDir = await mkdtemp(join(tmpdir(), 'indie-writer-acceptance-'));
    this.app =
      ASSEMBLY === 'in-process'
        ? new InProcessApp(this.dataDir)
        : new BinaryApp(ASSEMBLY as BinaryTransport, this.dataDir);
  }

  async dispose(): Promise<void> {
    await this.app?.close();
    if (this.dataDir) await rm(this.dataDir, { recursive: true, force: true });
  }
}

setWorldConstructor(IndieWriterWorld);

Before(async function (this: IndieWriterWorld) {
  await this.open();
});

After(async function (this: IndieWriterWorld) {
  await this.dispose();
});

/** The suite has one actor; Then-steps that speak of "the outcome" ask on their behalf. */
export const AUTHOR = 'Ada';

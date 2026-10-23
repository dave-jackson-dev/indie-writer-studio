import { createInterface } from 'node:readline';

import { app, type BrowserWindow } from 'electron';

import { driverCall, parseDriverLine } from './harness.js';

/**
 * The test driver's two modes (ADR-004 D5), available only in an unpackaged build (`main.ts` gates
 * them). Output is one JSON object per line on stdout.
 */
const loaded = (target: BrowserWindow): Promise<void> =>
  new Promise((resolve) => target.webContents.once('did-finish-load', () => resolve()));

const emit = (value: unknown): void => void process.stdout.write(`${JSON.stringify(value)}\n`);

/** `--smoke`: reports what the page can see, then quits. */
export async function reportSmoke(target: BrowserWindow, hostBooted: boolean): Promise<void> {
  await loaded(target);
  const seen = JSON.parse(
    (await target.webContents.executeJavaScript(
      `JSON.stringify([typeof require, typeof process, typeof module, typeof window.ipcRenderer,
        document.title, Object.keys(window.indieWriter ?? {}).sort().join(',')])`,
    )) as string,
  ) as string[];
  const [require, processGlobal, moduleGlobal, ipcRenderer, title, bridge] = seen;
  emit({
    event: 'smoke',
    electron: process.versions.electron,
    node: process.versions.node,
    hostBooted,
    rendererGlobals: { require, process: processGlobal, module: moduleGlobal, ipcRenderer },
    bridge,
    title,
  });
  app.quit();
}

/**
 * `--ipc-driver`: each stdin line is `{ operation, input?, correlationId? }` (run it through the
 * page's own bridge and print the envelope) or `{ eval: code, id }` (run code in the page and print
 * `{ event: "eval", id, result }`, so a test can look at the page itself). The first line printed is
 * `{ event: "ready" }`. The app quits when stdin ends.
 */
export async function runIpcDriver(target: BrowserWindow): Promise<void> {
  await loaded(target);
  emit({ event: 'ready' });
  const running: Promise<void>[] = [];
  for await (const text of createInterface({ input: process.stdin })) {
    const line = parseDriverLine(text);
    if (line.kind === 'blank') continue;
    if (line.kind === 'invalid') {
      emit({ event: 'invalid', message: line.message });
      continue;
    }
    if (line.kind === 'eval') {
      running.push(
        (target.webContents.executeJavaScript(line.code) as Promise<unknown>).then(
          (result) => emit({ event: 'eval', id: line.id, result }),
          (error: unknown) => emit({ event: 'eval', id: line.id, error: String(error) }),
        ),
      );
      continue;
    }
    running.push(
      (target.webContents.executeJavaScript(driverCall(line)) as Promise<unknown>).then(
        (envelope) => emit(envelope),
      ),
    );
  }
  await Promise.all(running);
  app.quit();
}

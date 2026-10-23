import { rm } from 'node:fs/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { launch, tempDataDir, type Running } from './launch.js';

const running: Running[] = [];
const dirs: string[] = [];
afterEach(async () => {
  for (const app of running.splice(0)) app.kill();
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const start = async (dataDir?: string): Promise<Running> => {
  const dir = dataDir ?? (await tempDataDir());
  if (!dataDir) dirs.push(dir);
  const app = launch(['--ipc-driver'], { INDIE_WRITER_DATA_DIR: dir });
  running.push(app);
  await app.next((line) => line.event === 'ready');
  return app;
};

const ask = async (app: Running, request: object): Promise<any> => {
  const before = app.lines.length;
  app.send(request);
  return app.next((line) => app.lines.indexOf(line) >= before && line.schemaVersion === '1.0.0');
};

const evaluate = async (app: Running, code: string): Promise<any> => {
  const id = `e${Math.random()}`;
  app.send({ eval: code, id });
  return (await app.next((line) => line.event === 'eval' && line.id === id)).result;
};

describe('the IPC transport, through the real window', () => {
  it('runs an operation from the page through preload and main, and returns the shared envelope', async () => {
    const app = await start();
    expect(await ask(app, { operation: 'system.health' })).toMatchObject({
      status: 'success',
      data: { status: 'ok', service: 'indie-writer', components: ['works', 'manuscript'] },
    });
    const added = await ask(app, { operation: 'works.work.add', input: { title: 'Salt Road' } });
    expect(added).toMatchObject({ status: 'success', data: { work: { title: 'Salt Road' } } });
  });

  it('answers help and refusals as envelopes', async () => {
    const app = await start();
    expect(JSON.stringify(await ask(app, { operation: 'help' }))).toContain('works.work.add');
    expect(await ask(app, { operation: 'nope.nothing' })).toMatchObject({
      error: { code: 'UNKNOWN_OPERATION' },
    });
    expect(
      await ask(app, { operation: 'works.work.add', input: { title: 'x', bogus: 1 } }),
    ).toMatchObject({
      error: { code: 'INVALID_INPUT' },
    });
  });

  it('keeps works across a quit and relaunch over the same data directory', async () => {
    const dir = await tempDataDir();
    dirs.push(dir);
    const first = await start(dir);
    await ask(first, { operation: 'works.work.add', input: { title: 'Salt Road' } });
    expect(await first.exit()).toBe(0);
    running.splice(running.indexOf(first), 1);
    const second = await start(dir);
    const listed = await ask(second, { operation: 'works.work.list' });
    expect(listed.data.works.map((w: { title: string }) => w.title)).toEqual(['Salt Road']);
  });

  it('refuses script evaluation, the network and navigation away from the shipped page', async () => {
    const app = await start();
    expect(
      await evaluate(app, `(() => { try { return eval('1+1'); } catch (e) { return e.name; } })()`),
    ).toBe('EvalError');
    expect(
      await evaluate(app, `fetch('https://example.com/').then(() => 'reached', () => 'refused')`),
    ).toBe('refused');
    await evaluate(app, `void (location.href = 'https://example.com/')`);
    expect(await evaluate(app, 'location.protocol')).toBe('file:');
  });

  it('exposes nothing on the bridge but the two functions, and they cannot be replaced', async () => {
    const app = await start();
    expect(await evaluate(app, `Object.keys(window.indieWriter).sort().join(',')`)).toBe(
      'help,request',
    );
    expect(
      await evaluate(
        app,
        `(() => { try { window.indieWriter = {}; } catch {} return Object.keys(window.indieWriter).sort().join(','); })()`,
      ),
    ).toBe('help,request');
  });
});

describe('one window at a time', () => {
  it('lets a second launch quit at once while the first keeps working', async () => {
    const dir = await tempDataDir();
    dirs.push(dir);
    const first = await start(dir);
    const second = launch(['--ipc-driver'], { INDIE_WRITER_DATA_DIR: dir });
    running.push(second);
    expect(await second.exit()).toBe(0);
    expect(await ask(first, { operation: 'system.health' })).toMatchObject({ status: 'success' });
  });
});

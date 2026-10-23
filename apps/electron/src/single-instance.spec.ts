import { describe, expect, it } from 'vitest';

import { keepSingleInstance, type InstanceApp } from './single-instance.js';

function fakeApp(lock: boolean) {
  const calls: string[] = [];
  let second: (() => void) | undefined;
  const app: InstanceApp = {
    requestSingleInstanceLock: () => lock,
    quit: () => void calls.push('quit'),
    on: (_event, listener) => void (second = listener),
  };
  return { app, calls, secondLaunch: () => second?.() };
}

describe('keepSingleInstance', () => {
  it('stays when it gets the lock, and brings the window forward on a second launch', () => {
    const { app, calls, secondLaunch } = fakeApp(true);
    let focused = 0;
    expect(keepSingleInstance(app, () => void focused++)).toBe(true);
    secondLaunch();
    expect(focused).toBe(1);
    expect(calls).toEqual([]);
  });

  it('quits at once when another copy holds the lock', () => {
    const { app, calls, secondLaunch } = fakeApp(false);
    expect(keepSingleInstance(app, () => undefined)).toBe(false);
    expect(calls).toEqual(['quit']);
    expect(secondLaunch).not.toThrow();
  });
});

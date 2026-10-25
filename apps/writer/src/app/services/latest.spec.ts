import { describe, expect, it } from 'vitest';

import { Latest } from './latest';

describe('Latest', () => {
  it('counts the only request as current', () => {
    const latest = new Latest();
    expect(latest.begin()()).toBe(true);
  });

  it('makes an earlier request stale once a later one has begun', () => {
    const latest = new Latest();
    const first = latest.begin();
    const second = latest.begin();
    expect(first()).toBe(false);
    expect(second()).toBe(true);
  });

  it('keeps a request current until another begins, however often it is asked', () => {
    const latest = new Latest();
    const only = latest.begin();
    expect([only(), only()]).toEqual([true, true]);
  });
});

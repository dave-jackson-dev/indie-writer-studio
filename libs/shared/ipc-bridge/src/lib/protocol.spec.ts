import { describe, expect, it } from 'vitest';

import { BRIDGE_METHODS, BRIDGE_NAME, REQUEST_CHANNEL, isEnvelopeRequest } from './protocol.js';

describe('the IPC protocol', () => {
  it('names the one channel and the one bridge, in the app’s own namespace', () => {
    expect(REQUEST_CHANNEL).toBe('indie-writer:request');
    expect(BRIDGE_NAME).toBe('indieWriter');
  });

  it('exposes exactly two functions to the page, and no raw IPC', () => {
    expect([...BRIDGE_METHODS].sort()).toEqual(['help', 'request']);
  });

  it.each([
    [{ operation: 'works.work.list' }, true],
    [{ operation: 'works.work.add', input: { title: 'T' }, correlationId: 'c' }, true],
    [{ operation: '' }, false],
    [{ operation: 5 }, false],
    [{ input: {} }, false],
    [null, false],
    ['works.work.list', false],
    [[], false],
  ])('recognises the shape of a request %j as %s', (value, expected) => {
    expect(isEnvelopeRequest(value)).toBe(expected);
  });
});

import { describe, expect, it } from 'vitest';

import { CascadeHooks } from './cascade.js';

describe('CascadeHooks', () => {
  it('runs every hook registered for an owner, in order, with the id and the session', async () => {
    const hooks = new CascadeHooks();
    const calls: string[] = [];
    hooks.register('work', async (id, session) => void calls.push(`a:${id}:${String(session)}`));
    hooks.register('work', async (id) => void calls.push(`b:${id}`));
    hooks.register('person', async (id) => void calls.push(`other:${id}`));
    await hooks.run('work', 'w1', 'S' as never);
    expect(calls).toEqual(['a:w1:S', 'b:w1']);
  });

  it('does nothing for an owner with no hooks', async () => {
    await expect(new CascadeHooks().run('work', 'w1', {} as never)).resolves.toBeUndefined();
  });

  it('stops at the first hook that throws, and passes the error on', async () => {
    const hooks = new CascadeHooks();
    const calls: string[] = [];
    hooks.register('work', async () => {
      throw new Error('no');
    });
    hooks.register('work', async () => void calls.push('never'));
    await expect(hooks.run('work', 'w1', {} as never)).rejects.toThrow('no');
    expect(calls).toEqual([]);
  });
});

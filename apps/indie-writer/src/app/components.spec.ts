import { describe, expect, it } from 'vitest';

import { createComponents } from './components.js';
import { operationsFor } from './operations.js';

describe('components', () => {
  it('composes the works catalog', () => {
    const components = createComponents({});
    expect(components.map((c) => c.name)).toEqual(['works']);
  });

  it('exposes the root operations and every component operation in one list', () => {
    const names = operationsFor(createComponents({})).map((o) => o.name);
    expect(names).toContain('system.health');
    expect(names).toContain('works.work.add');
    expect(new Set(names).size).toBe(names.length);
  });

  it('reads the data directory from INDIE_WRITER_DATA_DIR when none is given', () => {
    const previous = process.env['INDIE_WRITER_DATA_DIR'];
    process.env['INDIE_WRITER_DATA_DIR'] = '/tmp/iw-data';
    try {
      expect(createComponents().map((c) => c.name)).toEqual(['works']);
    } finally {
      if (previous === undefined) delete process.env['INDIE_WRITER_DATA_DIR'];
      else process.env['INDIE_WRITER_DATA_DIR'] = previous;
    }
  });
});

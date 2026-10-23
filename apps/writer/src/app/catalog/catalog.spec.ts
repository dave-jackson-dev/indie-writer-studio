import { describe, expect, it } from 'vitest';

import { STATUS_FILTER, toWorkRows, type WorkDto } from './catalog';

const work = (over: Partial<WorkDto>): WorkDto => ({
  id: 'w1',
  title: 'The Salt Road',
  status: 'draft',
  editions: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('toWorkRows', () => {
  it('keeps the order the app answered in', () => {
    const rows = toWorkRows([work({ id: 'a', title: 'A' }), work({ id: 'b', title: 'B' })]);
    expect(rows.map((row) => row.title)).toEqual(['A', 'B']);
  });

  it('shows a missing subtitle as empty text and counts the editions', () => {
    const [row] = toWorkRows([
      work({
        editions: [
          { number: 1, label: 'Edition 1', status: 'published' },
          { number: 2, label: 'Edition 2', status: 'draft' },
        ],
      }),
    ]);
    expect(row).toMatchObject({ subtitle: '', editionCount: 2, status: 'draft' });
  });

  it('keeps the subtitle when there is one', () => {
    expect(toWorkRows([work({ subtitle: 'A Novel' })])[0]?.subtitle).toBe('A Novel');
  });
});

describe('STATUS_FILTER', () => {
  it('offers every status and a way back to all of them', () => {
    expect(STATUS_FILTER.map((option) => option.text)).toEqual([
      'All',
      'draft',
      'in-progress',
      'complete',
    ]);
    expect(STATUS_FILTER[0]?.value).toBe('');
  });
});

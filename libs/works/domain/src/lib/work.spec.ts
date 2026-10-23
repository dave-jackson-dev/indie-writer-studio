import { describe, expect, it } from 'vitest';

import {
  createWork,
  parseWorkStatus,
  updateWork,
  WorksDomainError,
  WORK_STATUSES,
} from './work.js';

const NOW = '2026-11-01T10:00:00.000Z';
const LATER = '2026-11-02T09:30:00.000Z';

const fail = (run: () => unknown): WorksDomainError => {
  try {
    run();
  } catch (error) {
    return error as WorksDomainError;
  }
  throw new Error('expected a WorksDomainError');
};

describe('createWork', () => {
  it('creates a draft with no editions, stamped with the time', () => {
    expect(createWork('w1', { title: 'The Salt Road' }, NOW)).toEqual({
      id: 'w1',
      title: 'The Salt Road',
      status: 'draft',
      editions: [],
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('trims the title, subtitle and synopsis', () => {
    const work = createWork(
      'w1',
      { title: '  Salt  ', subtitle: ' A Novel ', synopsis: ' Hi ' },
      NOW,
    );
    expect([work.title, work.subtitle, work.synopsis]).toEqual(['Salt', 'A Novel', 'Hi']);
  });

  it('treats a blank subtitle or synopsis as absent', () => {
    const work = createWork('w1', { title: 'Salt', subtitle: '  ', synopsis: '' }, NOW);
    expect('subtitle' in work).toBe(false);
    expect('synopsis' in work).toBe(false);
  });

  it.each(['', '   '])('refuses the title %j', (title) => {
    const error = fail(() => createWork('w1', { title }, NOW));
    expect(error).toBeInstanceOf(WorksDomainError);
    expect(error.code).toBe('INVALID_WORK');
  });

  it('accepts a title of exactly 200 characters and refuses 201', () => {
    expect(createWork('w1', { title: 'x'.repeat(200) }, NOW).title).toHaveLength(200);
    expect(fail(() => createWork('w1', { title: 'x'.repeat(201) }, NOW)).code).toBe('INVALID_WORK');
  });

  it('limits subtitle to 200 and synopsis to 5000 characters', () => {
    expect(fail(() => createWork('w1', { title: 'T', subtitle: 'x'.repeat(201) }, NOW)).code).toBe(
      'INVALID_WORK',
    );
    expect(createWork('w1', { title: 'T', synopsis: 'x'.repeat(5000) }, NOW).synopsis).toHaveLength(
      5000,
    );
    expect(fail(() => createWork('w1', { title: 'T', synopsis: 'x'.repeat(5001) }, NOW)).code).toBe(
      'INVALID_WORK',
    );
  });
});

describe('updateWork', () => {
  const base = createWork('w1', { title: 'Salt', subtitle: 'A Novel' }, NOW);

  it('changes only what is given and stamps updatedAt', () => {
    const next = updateWork(base, { synopsis: 'Blurb' }, LATER);
    expect(next).toMatchObject({ title: 'Salt', subtitle: 'A Novel', synopsis: 'Blurb' });
    expect(next.createdAt).toBe(NOW);
    expect(next.updatedAt).toBe(LATER);
  });

  it('does not mutate the work it was given', () => {
    updateWork(base, { title: 'Other' }, LATER);
    expect(base.title).toBe('Salt');
  });

  it('clears the subtitle or synopsis when given an empty string', () => {
    const next = updateWork(base, { subtitle: '' }, LATER);
    expect('subtitle' in next).toBe(false);
  });

  it('retitles with the same validation as creation', () => {
    expect(updateWork(base, { title: ' Salt Road ' }, LATER).title).toBe('Salt Road');
    expect(fail(() => updateWork(base, { title: '  ' }, LATER)).code).toBe('INVALID_WORK');
  });

  it.each(WORK_STATUSES)('accepts the status %s', (status) => {
    expect(updateWork(base, { status }, LATER).status).toBe(status);
  });

  it('refuses a status that does not exist', () => {
    expect(fail(() => updateWork(base, { status: 'abandoned' as never }, LATER)).code).toBe(
      'INVALID_WORK',
    );
  });

  it('keeps the editions it already has', () => {
    expect(updateWork(base, { title: 'X' }, LATER).editions).toBe(base.editions);
  });
});

describe('parseWorkStatus', () => {
  it.each(WORK_STATUSES)('accepts %s', (status) => {
    expect(parseWorkStatus(status)).toBe(status);
  });

  it.each(['abandoned', '', 'Draft'])('refuses %j as INVALID_WORK', (status) => {
    expect(fail(() => parseWorkStatus(status)).code).toBe('INVALID_WORK');
  });
});

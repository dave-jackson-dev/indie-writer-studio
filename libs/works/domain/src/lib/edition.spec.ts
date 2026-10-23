import { describe, expect, it } from 'vitest';

import { addEdition, publishEdition } from './edition.js';
import { createWork, WorksDomainError, type Work } from './work.js';

const NOW = '2026-11-01T10:00:00.000Z';
const LATER = '2026-12-05T08:00:00.000Z';
const fresh = (): Work => createWork('w1', { title: 'Salt' }, NOW);

const fail = (run: () => unknown): WorksDomainError => {
  try {
    run();
  } catch (error) {
    return error as WorksDomainError;
  }
  throw new Error('expected a WorksDomainError');
};

describe('addEdition', () => {
  it('numbers the first edition 1, labels it by number and starts it as a draft', () => {
    const work = addEdition(fresh(), {}, NOW);
    expect(work.editions).toEqual([
      { number: 1, label: 'Edition 1', status: 'draft', createdAt: NOW, updatedAt: NOW },
    ]);
  });

  it('numbers editions consecutively', () => {
    const work = addEdition(addEdition(fresh(), {}, NOW), { label: 'Revised' }, LATER);
    expect(work.editions.map((e) => [e.number, e.label])).toEqual([
      [1, 'Edition 1'],
      [2, 'Revised'],
    ]);
  });

  it('keeps notes, trimmed, and drops blank ones', () => {
    expect(addEdition(fresh(), { notes: '  typo fixes ' }, NOW).editions[0]?.notes).toBe(
      'typo fixes',
    );
    expect('notes' in (addEdition(fresh(), { notes: ' ' }, NOW).editions[0] ?? {})).toBe(false);
  });

  it('refuses a label over 100 characters', () => {
    expect(fail(() => addEdition(fresh(), { label: 'x'.repeat(101) }, NOW)).code).toBe(
      'INVALID_EDITION',
    );
  });

  it('stamps the work updatedAt and leaves the original untouched', () => {
    const work = fresh();
    const next = addEdition(work, {}, LATER);
    expect(next.updatedAt).toBe(LATER);
    expect(work.editions).toEqual([]);
  });
});

describe('publishEdition', () => {
  const two = (): Work => addEdition(addEdition(fresh(), {}, NOW), {}, NOW);

  it('publishes a draft on the given date', () => {
    const edition = publishEdition(two(), 1, '2026-11-02', LATER).editions[0];
    expect(edition).toMatchObject({ number: 1, status: 'published', publishedOn: '2026-11-02' });
    expect(edition?.updatedAt).toBe(LATER);
  });

  it('defaults the date to the day of the clock when none is given', () => {
    expect(publishEdition(two(), 1, undefined, LATER).editions[0]?.publishedOn).toBe('2026-12-05');
  });

  it('supersedes the edition that was published before, so one is published at a time', () => {
    const first = publishEdition(two(), 1, '2026-11-02', NOW);
    const second = publishEdition(first, 2, '2027-03-15', LATER);
    expect(second.editions.map((e) => [e.number, e.status])).toEqual([
      [1, 'superseded'],
      [2, 'published'],
    ]);
    expect(second.editions[0]?.publishedOn).toBe('2026-11-02');
  });

  it('refuses to publish an edition twice', () => {
    const published = publishEdition(two(), 1, '2026-11-02', NOW);
    expect(fail(() => publishEdition(published, 1, '2026-12-01', LATER)).code).toBe(
      'EDITION_CONFLICT',
    );
  });

  it('refuses to publish a superseded edition again', () => {
    const state = publishEdition(publishEdition(two(), 1, '2026-11-02', NOW), 2, '2027-01-01', NOW);
    expect(fail(() => publishEdition(state, 1, '2027-02-01', LATER)).code).toBe('EDITION_CONFLICT');
  });

  it('refuses an edition that does not exist', () => {
    expect(fail(() => publishEdition(two(), 9, '2026-11-02', LATER)).code).toBe(
      'EDITION_NOT_FOUND',
    );
  });

  it.each(['2026-02-30', '2026-13-01', '02/11/2026', 'tomorrow', '2026-1-5', ''])(
    'refuses the date %j',
    (date) => {
      expect(fail(() => publishEdition(two(), 1, date, LATER)).code).toBe('INVALID_EDITION');
    },
  );

  it('accepts a leap day only in a leap year', () => {
    expect(publishEdition(two(), 1, '2028-02-29', LATER).editions[0]?.publishedOn).toBe(
      '2028-02-29',
    );
    expect(fail(() => publishEdition(two(), 1, '2027-02-29', LATER)).code).toBe('INVALID_EDITION');
  });
});

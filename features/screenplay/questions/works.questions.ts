import type { Actor } from '@cucumber/screenplay';

import type { Envelope } from '../abilities/operate-app.ts';
import type { IndieWriterWorld } from '../../support/world.ts';

type Author = Actor<IndieWriterWorld>;

export interface EditionView {
  number: number;
  label: string;
  status: 'draft' | 'published' | 'superseded';
  publishedOn?: string;
  notes?: string;
}

export interface WorkView {
  id: string;
  title: string;
  subtitle?: string;
  synopsis?: string;
  status: 'draft' | 'in-progress' | 'complete';
  editions: EditionView[];
}

/** What the app answered to the last thing the Author did. */
export const theOutcome =
  () =>
  (actor: Author): Envelope => {
    const envelope = actor.world.lastEnvelope;
    if (!envelope) throw new Error('The author has not operated the app yet in this scenario.');
    return envelope;
  };

/** The whole catalog, read fresh from the app (this does not change "the outcome"). */
export const theCatalog =
  () =>
  async (actor: Author): Promise<WorkView[]> => {
    const envelope = await actor.world.app.invoke('works.work.list');
    return ((envelope.data as { works?: WorkView[] } | undefined)?.works ?? []) as WorkView[];
  };

/** The Works in the most recent listing the Author asked for. */
export const theListedWorks =
  () =>
  (actor: Author): WorkView[] =>
    ((theOutcome()(actor).data as { works?: WorkView[] } | undefined)?.works ?? []) as WorkView[];

export const theWorkTitled =
  (title: string) =>
  async (actor: Author): Promise<WorkView> => {
    const work = (await theCatalog()(actor)).find((candidate) => candidate.title === title);
    if (!work) throw new Error(`No work titled "${title}" in the catalog.`);
    return work;
  };

/** The Editions in the most recent edition listing the Author asked for. */
export const theListedEditions =
  () =>
  (actor: Author): EditionView[] =>
    ((theOutcome()(actor).data as { editions?: EditionView[] } | undefined)?.editions ??
      []) as EditionView[];

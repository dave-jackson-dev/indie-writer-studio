import type { Actor } from '@cucumber/screenplay';

import type { Envelope } from '../abilities/operate-app.ts';
import type { IndieWriterWorld } from '../../support/world.ts';
import { theCatalog } from '../questions/works.questions.ts';

type Author = Actor<IndieWriterWorld>;
type Task<T = Envelope> = (actor: Author) => Promise<T>;

/** The Author operates the app; whatever it answers becomes "the outcome". */
export const operate =
  (operation: string, input: Record<string, unknown> = {}): Task =>
  async (actor) => {
    const envelope = await actor.world.app.invoke(operation, input);
    actor.world.lastEnvelope = envelope;
    return envelope;
  };

/** Works are named by title in scenarios; the app knows them by id. */
export const idOf = async (actor: Author, title: string): Promise<string> => {
  const work = (await actor.ask(theCatalog())).find((candidate) => candidate.title === title);
  if (!work) throw new Error(`No work titled "${title}" in the catalog.`);
  return work.id;
};

export const checkSystemHealth = (): Task => operate('system.health');

export const addWork = (input: { title: string; subtitle?: string; synopsis?: string }): Task =>
  operate('works.work.add', input);

export const updateWork =
  (title: string, changes: Record<string, unknown>): Task =>
  async (actor) =>
    operate('works.work.update', { id: await idOf(actor, title), ...changes })(actor);

export const listWorks = (status?: string): Task =>
  operate('works.work.list', status === undefined ? {} : { status });

export const getWork = (id: string): Task => operate('works.work.get', { id });

export const removeWork =
  (title: string): Task =>
  async (actor) =>
    operate('works.work.remove', { id: await idOf(actor, title) })(actor);

export const removeWorkById = (id: string): Task => operate('works.work.remove', { id });

export const addEdition =
  (title: string, label?: string): Task =>
  async (actor) =>
    operate('works.edition.add', {
      'work-id': await idOf(actor, title),
      ...(label === undefined ? {} : { label }),
    })(actor);

export const addEditionToWorkId = (workId: string): Task =>
  operate('works.edition.add', { 'work-id': workId });

export const publishEdition =
  (title: string, number: number, publishedOn: string): Task =>
  async (actor) =>
    operate('works.edition.publish', {
      'work-id': await idOf(actor, title),
      number,
      'published-on': publishedOn,
    })(actor);

export const listEditions =
  (title: string): Task =>
  async (actor) =>
    operate('works.edition.list', { 'work-id': await idOf(actor, title) })(actor);

export const restartApp = (): Task<void> => (actor) => actor.world.app.restart();

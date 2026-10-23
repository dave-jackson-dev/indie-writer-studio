import type { Actor } from '@cucumber/screenplay';

import type { Envelope } from '../abilities/operate-app.ts';
import type { IndieWriterWorld } from '../../support/world.ts';
import { theNodeTitled } from '../questions/manuscript.questions.ts';
import { idOf, operate } from './works.tasks.ts';

type Author = Actor<IndieWriterWorld>;
type Task<T = Envelope> = (actor: Author) => Promise<T>;

export interface Placement {
  matter?: string;
  /** Title of the parent node. */
  under?: string;
  /** Id of the parent node, for a parent that does not exist. */
  underId?: string;
  position?: number;
}

const parentOf = async (actor: Author, workTitle: string, placement: Placement) => {
  if (placement.underId !== undefined) return { 'parent-id': placement.underId };
  if (placement.under !== undefined) {
    return { 'parent-id': (await theNodeTitled(workTitle, placement.under)(actor)).id };
  }
  return {};
};

const where = async (actor: Author, workTitle: string, placement: Placement) => ({
  ...(await parentOf(actor, workTitle, placement)),
  ...(placement.matter === undefined ? {} : { matter: placement.matter }),
  ...(placement.position === undefined ? {} : { position: placement.position }),
});

export const addNode =
  (workTitle: string, kind: string, title: string, placement: Placement = {}): Task =>
  async (actor) =>
    operate('manuscript.node.add', {
      'work-id': await idOf(actor, workTitle),
      kind,
      title,
      ...(await where(actor, workTitle, placement)),
    })(actor);

export const writeText =
  (workTitle: string, nodeTitle: string, body: string): Task =>
  async (actor) =>
    operate('manuscript.node.update', {
      'work-id': await idOf(actor, workTitle),
      id: (await theNodeTitled(workTitle, nodeTitle)(actor)).id,
      body,
    })(actor);

export const renameNode =
  (workTitle: string, nodeTitle: string, title: string): Task =>
  async (actor) =>
    operate('manuscript.node.update', {
      'work-id': await idOf(actor, workTitle),
      id: (await theNodeTitled(workTitle, nodeTitle)(actor)).id,
      title,
    })(actor);

export const moveNode =
  (workTitle: string, nodeTitle: string, placement: Placement): Task =>
  async (actor) =>
    operate('manuscript.node.move', {
      'work-id': await idOf(actor, workTitle),
      id: (await theNodeTitled(workTitle, nodeTitle)(actor)).id,
      ...(await where(actor, workTitle, placement)),
    })(actor);

export const removeNode =
  (workTitle: string, nodeTitle: string): Task =>
  async (actor) =>
    operate('manuscript.node.remove', {
      'work-id': await idOf(actor, workTitle),
      id: (await theNodeTitled(workTitle, nodeTitle)(actor)).id,
    })(actor);

export const removeNodeById =
  (workTitle: string, id: string): Task =>
  async (actor) =>
    operate('manuscript.node.remove', { 'work-id': await idOf(actor, workTitle), id })(actor);

export const outlineOfWorkId = (workId: string): Task =>
  operate('manuscript.outline', { 'work-id': workId });

export const addNodeToWorkId =
  (workId: string, kind: string, title: string, matter: string): Task =>
  (actor) =>
    operate('manuscript.node.add', { 'work-id': workId, kind, title, matter })(actor);

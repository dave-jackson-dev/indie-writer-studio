import type { Actor } from '@cucumber/screenplay';

import type { IndieWriterWorld } from '../../support/world.ts';
import { idOf } from '../tasks/works.tasks.ts';

type Author = Actor<IndieWriterWorld>;

export type Matter = 'front' | 'main' | 'back';

export interface OutlineNode {
  id: string;
  kind: 'part' | 'chapter' | 'scene' | 'section';
  title: string;
  words: number;
  totalWords: number;
  children: OutlineNode[];
}

export interface Outline {
  front: OutlineNode[];
  main: OutlineNode[];
  back: OutlineNode[];
  totalWords: number;
}

export interface OutlineRow {
  matter: Matter;
  depth: number;
  kind: OutlineNode['kind'];
  title: string;
  id: string;
  words: number;
  totalWords: number;
  childCount: number;
}

const MATTERS: Matter[] = ['front', 'main', 'back'];

/** The outline of a Work, read fresh from the app (this does not change "the outcome"). */
export const theOutlineOf =
  (workTitle: string) =>
  async (actor: Author): Promise<Outline> => {
    const workId = await idOf(actor, workTitle);
    const envelope = await actor.world.app.invoke('manuscript.outline', { 'work-id': workId });
    if (envelope.status !== 'success') throw new Error(JSON.stringify(envelope.error));
    return envelope.data as Outline;
  };

/** The outline flattened in reading order: front matter, then main, then back. */
export const theOutlineRows =
  (workTitle: string) =>
  async (actor: Author): Promise<OutlineRow[]> => {
    const outline = await theOutlineOf(workTitle)(actor);
    const rows: OutlineRow[] = [];
    const walk = (matter: Matter, nodes: OutlineNode[], depth: number): void => {
      for (const node of nodes) {
        rows.push({
          matter,
          depth,
          kind: node.kind,
          title: node.title,
          id: node.id,
          words: node.words,
          totalWords: node.totalWords,
          childCount: node.children.length,
        });
        walk(matter, node.children, depth + 1);
      }
    };
    for (const matter of MATTERS) walk(matter, outline[matter], 0);
    return rows;
  };

export const theNodeTitled =
  (workTitle: string, nodeTitle: string) =>
  async (actor: Author): Promise<OutlineRow> => {
    const row = (await theOutlineRows(workTitle)(actor)).find((r) => r.title === nodeTitle);
    if (!row) throw new Error(`No node titled "${nodeTitle}" in the manuscript of "${workTitle}".`);
    return row;
  };

export const theTextOf =
  (workTitle: string, nodeTitle: string) =>
  async (actor: Author): Promise<string> => {
    const node = await theNodeTitled(workTitle, nodeTitle)(actor);
    const envelope = await actor.world.app.invoke('manuscript.node.get', {
      'work-id': await idOf(actor, workTitle),
      id: node.id,
    });
    return (envelope.data as { node: { body: string } }).node.body;
  };

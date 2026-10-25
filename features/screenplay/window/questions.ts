import type { Actor } from '@cucumber/screenplay';

import type { WriterWorld } from '../../window-support/world.ts';
import { ui } from './selectors.ts';

type Author = Actor<WriterWorld>;

const page = (actor: Author) => actor.world.window.page;
const texts = async (locator: ReturnType<ReturnType<typeof page>['locator']>): Promise<string[]> =>
  (await locator.allInnerTexts()).map((text) => text.trim());

export const theWindowTitle = () => async (actor: Author) => page(actor).title();

export interface CatalogRow {
  title: string;
  subtitle: string;
  status: string;
  editions: number;
}

/** The rows of the catalog as Ada reads them, once the grid has settled. */
export const theCatalogRows =
  () =>
  async (actor: Author): Promise<CatalogRow[]> => {
    const rows = page(actor).locator(ui.catalogRow);
    const count = await rows.count();
    const result: CatalogRow[] = [];
    for (let at = 0; at < count; at++) {
      const row = rows.nth(at);
      result.push({
        title: ((await row.locator(ui.workTitle).allInnerTexts())[0] ?? '').trim(),
        subtitle: ((await row.locator(ui.workSubtitle).allInnerTexts())[0] ?? '').trim(),
        status: ((await row.locator(ui.workStatus).allInnerTexts())[0] ?? '').trim(),
        editions: Number(((await row.locator('td.e-rowcell').nth(3).innerText()) ?? '').trim()),
      });
    }
    return result;
  };

export const theCatalogInvitation = () => async (actor: Author) =>
  texts(page(actor).locator(ui.catalogEmpty));

export const theNotices = () => async (actor: Author) => texts(page(actor).locator(ui.notice));

export interface EditionRow {
  number: number;
  label: string;
  status: string;
  publishedOn: string;
}

export const theEditionRows =
  () =>
  async (actor: Author): Promise<EditionRow[]> => {
    const rows = page(actor).locator(ui.editionRow);
    const count = await rows.count();
    const result: EditionRow[] = [];
    for (let at = 0; at < count; at++) {
      const row = rows.nth(at);
      result.push({
        number: Number(((await row.locator(ui.editionNumber).allInnerTexts())[0] ?? '').trim()),
        label: ((await row.locator(ui.editionLabel).allInnerTexts())[0] ?? '').trim(),
        status: ((await row.locator(ui.editionStatus).allInnerTexts())[0] ?? '').trim(),
        publishedOn: ((await row.locator('td.e-rowcell').nth(3).innerText()) ?? '').trim(),
      });
    }
    return result;
  };

export const theEditionsInvitation = () => async (actor: Author) =>
  texts(page(actor).locator(ui.editionsEmpty));

export interface OutlineEntry {
  title: string;
  kind: string;
  words: number;
  /** The title of the section it sits under, if any. */
  parent?: string;
}

/** The outline as a flat list, each entry naming the section above it. */
export const theOutline =
  () =>
  async (actor: Author): Promise<OutlineEntry[]> => {
    const nodes = page(actor).locator(ui.outlineNode);
    const count = await nodes.count();
    const result: OutlineEntry[] = [];
    for (let at = 0; at < count; at++) {
      const node = nodes.nth(at);
      const parentTitle = await node.evaluate((li, selector) => {
        const above = li.parentElement?.closest('li.e-list-item');
        return above?.querySelector(selector)?.textContent?.trim();
      }, ui.nodeTitle);
      result.push({
        title: ((await node.locator(ui.nodeTitle).first().innerText()) ?? '').trim(),
        kind: ((await node.locator(ui.nodeKind).first().innerText()) ?? '').trim(),
        words: Number(
          ((await node.locator(ui.nodeWords).first().innerText()) ?? '').replace(/\D/g, ''),
        ),
        ...(parentTitle === undefined ? {} : { parent: parentTitle }),
      });
    }
    return result;
  };

export const theOutlineInvitation = () => async (actor: Author) =>
  texts(page(actor).locator(ui.outlineEmpty));

import type { Actor } from '@cucumber/screenplay';
import type { Page } from 'playwright-core';

import type { WriterWorld } from '../../window-support/world.ts';
import { ui } from './selectors.ts';

type Author = Actor<WriterWorld>;
type Task = (actor: Author) => Promise<void>;

const page = (actor: Author): Page => actor.world.window.page;

/** A row of the catalog, found the way an author finds it: by the title she reads. */
const workRow = (actor: Author, title: string) =>
  page(actor)
    .locator(ui.catalogRow)
    .filter({
      has: page(actor).locator(ui.workTitle, { hasText: new RegExp(`^${escape(title)}$`) }),
    });

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const dialog = (actor: Author) => page(actor).locator(ui.dialog);
const button = (actor: Author, name: string) =>
  page(actor).getByRole('button', { name, exact: true });
const field = (actor: Author, label: string) =>
  dialog(actor).getByRole('textbox', { name: label, exact: true });

/**
 * Picks an item in a Syncfusion drop-down list by its visible text. The real input is read-only and out
 * of the tab order, so the list is opened through the control's wrapper; a list inside a dialog that is
 * still opening can swallow the first click, so the click is repeated until the list is open.
 */
async function choose(actor: Author, input: ReturnType<Page['locator']>, item: string) {
  const wrapper = input.locator('xpath=ancestor::*[contains(@class,"e-input-group")][1]');
  const list = page(actor).locator('.e-ddl.e-popup.e-popup-open');
  for (let attempt = 0; attempt < 4 && !(await list.isVisible()); attempt++) {
    await wrapper.click();
    await list.waitFor({ timeout: 1_000 }).catch(() => undefined);
  }
  // The list fades in; a click that arrives while it does is lost, so the pointer rests on the item first.
  const choice = list.locator('.e-list-item', { hasText: item }).first();
  await choice.hover();
  await page(actor).waitForTimeout(150);
  await choice.click();
}

export const openTheWriter = (): Task => async (actor) => {
  await actor.world.window.open();
  await page(actor).locator(ui.appBarTitle).waitFor();
};

export const closeAndReopenTheWriter = (): Task => async (actor) => {
  await actor.world.window.close();
  await openTheWriter()(actor);
};

export const addWorkInWindow =
  (input: { title: string; subtitle?: string }): Task =>
  async (actor) => {
    await button(actor, 'Add work').click();
    await field(actor, 'Title').fill(input.title);
    if (input.subtitle !== undefined) await field(actor, 'Subtitle').fill(input.subtitle);
    await dialog(actor).getByRole('button', { name: 'Save', exact: true }).click();
  };

export const selectWorkInWindow =
  (title: string): Task =>
  async (actor) => {
    await workRow(actor, title).locator(ui.workTitle).click();
  };

export const setWorkStatusInWindow =
  (title: string, status: string): Task =>
  async (actor) => {
    await selectWorkInWindow(title)(actor);
    await button(actor, 'Edit').click();
    await choose(actor, dialog(actor).getByRole('combobox', { name: 'Status' }), status);
    await dialog(actor).getByRole('button', { name: 'Save', exact: true }).click();
  };

export const retitleWorkInWindow =
  (title: string, newTitle: string): Task =>
  async (actor) => {
    await selectWorkInWindow(title)(actor);
    await button(actor, 'Edit').click();
    await field(actor, 'Title').fill(newTitle);
    await dialog(actor).getByRole('button', { name: 'Save', exact: true }).click();
  };

export const filterCatalogByStatus =
  (status: string): Task =>
  async (actor) => {
    await choose(actor, page(actor).locator(ui.statusFilter).getByRole('combobox'), status);
  };

export const removeWorkInWindow =
  (title: string, confirm: boolean): Task =>
  async (actor) => {
    await selectWorkInWindow(title)(actor);
    await button(actor, 'Remove').click();
    await dialog(actor)
      .getByRole('button', { name: confirm ? 'Remove' : 'Cancel', exact: true })
      .click();
  };

export const addEditionInWindow =
  (label: string): Task =>
  async (actor) => {
    await button(actor, 'Add edition').click();
    await field(actor, 'Label').fill(label);
    await dialog(actor).getByRole('button', { name: 'Save', exact: true }).click();
    await page(actor).locator(ui.editionRow, { hasText: label }).waitFor();
  };

export const publishEditionInWindow =
  (number: number, date: string): Task =>
  async (actor) => {
    await page(actor)
      .locator(ui.editionRow)
      .filter({
        has: page(actor).locator(ui.editionNumber, { hasText: new RegExp(`^${number}$`) }),
      })
      .locator(ui.editionNumber)
      .click();
    await button(actor, 'Publish').click();
    await dialog(actor).getByRole('combobox', { name: 'Published on', exact: true }).fill(date);
    await dialog(actor).getByRole('button', { name: 'Publish', exact: true }).click();
  };

export const addOutlineNodeInWindow =
  (input: { kind: string; title: string; parent?: string }): Task =>
  async (actor) => {
    if (input.parent !== undefined) {
      await page(actor)
        .locator(ui.outlineNode)
        .filter({
          has: page(actor).locator(ui.nodeTitle, {
            hasText: new RegExp(`^${escape(input.parent)}$`),
          }),
        })
        .first()
        .locator(ui.nodeTitle)
        .first()
        .click();
    }
    await button(actor, 'Add section').click();
    await choose(actor, dialog(actor).getByRole('combobox', { name: 'Kind' }), input.kind);
    await field(actor, 'Title').fill(input.title);
    await dialog(actor).getByRole('button', { name: 'Save', exact: true }).click();
  };

export const removeOutlineNodeInWindow =
  (title: string): Task =>
  async (actor) => {
    await page(actor)
      .locator(ui.outlineNode)
      .filter({
        has: page(actor).locator(ui.nodeTitle, { hasText: new RegExp(`^${escape(title)}$`) }),
      })
      .first()
      .locator(ui.nodeTitle)
      .first()
      .click();
    await button(actor, 'Remove section').click();
    await dialog(actor).getByRole('button', { name: 'Remove', exact: true }).click();
  };

/**
 * Writing the text of a section is the Editor's job, which the window does not have yet. A scenario
 * that needs a section with words in it has the text put there through the app's own bridge, then
 * the window is reloaded to show it.
 */
export const haveTextWrittenInto =
  (title: string, text: string): Task =>
  async (actor) => {
    const p = page(actor);
    await p.evaluate(
      async ({ title, text }) => {
        const bridge = (
          globalThis as unknown as {
            indieWriter: import('@indie-writer-studio/ipc-bridge').IndieWriterBridge;
          }
        ).indieWriter;
        const works = (await bridge.request('works.work.list')).data as { works: { id: string }[] };
        const workId = works.works[0]?.id as string;
        const outline = (await bridge.request('manuscript.outline', { 'work-id': workId }))
          .data as { main: { id: string; title: string }[] };
        const node = outline.main.find((candidate) => candidate.title === title);
        if (!node) throw new Error(`No section titled ${title}`);
        await bridge.request('manuscript.node.update', {
          'work-id': workId,
          id: node.id,
          body: text,
        });
      },
      { title, text },
    );
    await p.reload();
    await p.locator(ui.appBarTitle).waitFor();
  };

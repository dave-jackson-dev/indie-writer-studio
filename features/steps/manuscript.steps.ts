import assert from 'node:assert/strict';

import { Given, Then, When, type DataTable } from '@cucumber/cucumber';
import type { Actor } from '@cucumber/screenplay';

import {
  theNodeTitled,
  theOutlineOf,
  theOutlineRows,
  theTextOf,
} from '../screenplay/questions/manuscript.questions.ts';
import {
  addNode,
  moveNode,
  outlineOfWorkId,
  removeNode,
  removeNodeById,
  renameNode,
  writeText,
  type Placement,
} from '../screenplay/tasks/manuscript.tasks.ts';
import { AUTHOR, type IndieWriterWorld } from '../support/world.ts';

type Author = Actor<IndieWriterWorld>;
const author = (world: IndieWriterWorld): Author => world.findOrCreateActor(AUTHOR) as Author;

const ok = (outcome: { status: string }) =>
  assert.equal(outcome.status, 'success', 'setup must not fail');

When(
  '{actor} adds a {word} {string} to the {word} matter of {string}',
  async (actor: Author, kind: string, title: string, matter: string, work: string) => {
    await actor.attemptsTo(addNode(work, kind, title, { matter }));
  },
);

When(
  '{actor} adds a {word} {string} to the {word} matter of {string} at position {int}',
  async (
    actor: Author,
    kind: string,
    title: string,
    matter: string,
    work: string,
    position: number,
  ) => {
    await actor.attemptsTo(addNode(work, kind, title, { matter, position }));
  },
);

When(
  '{actor} adds a {word} {string} under {string} in {string}',
  async (actor: Author, kind: string, title: string, under: string, work: string) => {
    await actor.attemptsTo(addNode(work, kind, title, { under }));
  },
);

When(
  '{actor} adds a node of kind {string} titled {string} to the {word} matter of {string}',
  async (actor: Author, kind: string, title: string, matter: string, work: string) => {
    await actor.attemptsTo(addNode(work, kind, title, { matter }));
  },
);

When(
  '{actor} adds a {word} {string} under the node with id {string} in {string}',
  async (actor: Author, kind: string, title: string, underId: string, work: string) => {
    await actor.attemptsTo(addNode(work, kind, title, { underId }));
  },
);

Given(
  '{actor} has added a {word} {string} to the {word} matter of {string}',
  async (actor: Author, kind: string, title: string, matter: string, work: string) => {
    ok(await actor.attemptsTo(addNode(work, kind, title, { matter })));
  },
);

Given(
  '{actor} has added a {word} {string} under {string} in {string}',
  async (actor: Author, kind: string, title: string, under: string, work: string) => {
    ok(await actor.attemptsTo(addNode(work, kind, title, { under })));
  },
);

/** A node of the given kind, with whatever valid ancestors it needs to stand where it can. */
Given(
  '{actor} has a {word} {string} in {string}',
  async (actor: Author, kind: string, title: string, work: string) => {
    if (kind === 'part' || kind === 'chapter' || kind === 'section') {
      ok(await actor.attemptsTo(addNode(work, kind, title, { matter: 'main' })));
      return;
    }
    ok(await actor.attemptsTo(addNode(work, 'chapter', 'Ancestor', { matter: 'main' })));
    ok(await actor.attemptsTo(addNode(work, kind, title, { under: 'Ancestor' })));
  },
);

When(
  '{actor} writes this text in {string} of {string}:',
  async (actor: Author, node: string, work: string, text: string) => {
    await actor.attemptsTo(writeText(work, node, text));
  },
);

Given(
  '{actor} has written {string} in {string} of {string}',
  async (actor: Author, text: string, node: string, work: string) => {
    ok(await actor.attemptsTo(writeText(work, node, text)));
  },
);

When(
  '{actor} renames {string} to {string} in {string}',
  async (actor: Author, node: string, title: string, work: string) => {
    await actor.attemptsTo(renameNode(work, node, title));
  },
);

When(
  '{actor} moves {string} under {string} in {string}',
  async (actor: Author, node: string, under: string, work: string) => {
    await actor.attemptsTo(moveNode(work, node, { under }));
  },
);

When(
  '{actor} moves {string} to the {word} matter of {string}',
  async (actor: Author, node: string, matter: string, work: string) => {
    await actor.attemptsTo(moveNode(work, node, { matter }));
  },
);

When(
  '{actor} moves {string} to the {word} matter of {string} at position {int}',
  async (actor: Author, node: string, matter: string, work: string, position: number) => {
    await actor.attemptsTo(moveNode(work, node, { matter, position } as Placement));
  },
);

When(
  '{actor} removes {string} from {string}',
  async (actor: Author, node: string, work: string) => {
    await actor.attemptsTo(removeNode(work, node));
  },
);

When(
  '{actor} removes the node with id {string} from {string}',
  async (actor: Author, id: string, work: string) => {
    await actor.attemptsTo(removeNodeById(work, id));
  },
);

When(
  '{actor} asks for the outline of the work with id {string}',
  async (actor: Author, id: string) => {
    await actor.attemptsTo(outlineOfWorkId(id));
  },
);

Then('the outline of {string} is empty', async function (this: IndieWriterWorld, work: string) {
  assert.deepEqual(await author(this).ask(theOutlineRows(work)), []);
});

Then(
  'the outline of {string} is:',
  async function (this: IndieWriterWorld, work: string, table: DataTable) {
    const rows = await author(this).ask(theOutlineRows(work));
    assert.deepEqual(
      rows.map((r) => ({ matter: r.matter, depth: String(r.depth), kind: r.kind, title: r.title })),
      table.hashes(),
    );
  },
);

Then(
  'the chapters in the main matter of {string} are {string}',
  async function (this: IndieWriterWorld, work: string, titles: string) {
    const outline = await author(this).ask(theOutlineOf(work));
    assert.deepEqual(
      outline.main.filter((n) => n.kind === 'chapter').map((n) => n.title),
      titles.split(',').map((t) => t.trim()),
    );
  },
);

Then(
  '{string} in {string} has no children',
  async function (this: IndieWriterWorld, node: string, work: string) {
    assert.equal((await author(this).ask(theNodeTitled(work, node))).childCount, 0);
  },
);

Then(
  '{string} in {string} has {int} words of its own and {int} in all',
  async function (this: IndieWriterWorld, node: string, work: string, own: number, all: number) {
    const row = await author(this).ask(theNodeTitled(work, node));
    assert.equal(row.words, own);
    assert.equal(row.totalWords, all);
  },
);

Then(
  'the manuscript of {string} has {int} words',
  async function (this: IndieWriterWorld, work: string, words: number) {
    assert.equal((await author(this).ask(theOutlineOf(work))).totalWords, words);
  },
);

Then(
  'the text of {string} in {string} is:',
  async function (this: IndieWriterWorld, node: string, work: string, text: string) {
    assert.equal(await author(this).ask(theTextOf(work, node)), text);
  },
);

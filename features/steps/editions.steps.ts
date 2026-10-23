import assert from 'node:assert/strict';

import { Given, Then, When, type DataTable } from '@cucumber/cucumber';
import type { Actor } from '@cucumber/screenplay';

import { theListedEditions, theWorkTitled } from '../screenplay/questions/works.questions.ts';
import {
  addEdition,
  addEditionToWorkId,
  listEditions,
  publishEdition,
} from '../screenplay/tasks/works.tasks.ts';
import { AUTHOR, type IndieWriterWorld } from '../support/world.ts';

type Author = Actor<IndieWriterWorld>;
const author = (world: IndieWriterWorld): Author => world.findOrCreateActor(AUTHOR) as Author;

When('{actor} adds an edition to {string}', async (actor: Author, title: string) => {
  await actor.attemptsTo(addEdition(title));
});

When(
  '{actor} adds an edition to {string} labelled {string}',
  async (actor: Author, title: string, label: string) => {
    await actor.attemptsTo(addEdition(title, label));
  },
);

When('{actor} adds an edition to the work with id {string}', async (actor: Author, id: string) => {
  await actor.attemptsTo(addEditionToWorkId(id));
});

Given('{actor} has added an edition to {string}', async (actor: Author, title: string) => {
  const outcome = await actor.attemptsTo(addEdition(title));
  assert.equal(outcome.status, 'success', 'setup must not fail');
});

When(
  '{actor} publishes edition {int} of {string} on {string}',
  async (actor: Author, number: number, title: string, date: string) => {
    await actor.attemptsTo(publishEdition(title, number, date));
  },
);

Given(
  '{actor} has published edition {int} of {string} on {string}',
  async (actor: Author, number: number, title: string, date: string) => {
    const outcome = await actor.attemptsTo(publishEdition(title, number, date));
    assert.equal(outcome.status, 'success', 'setup must not fail');
  },
);

When('{actor} lists the editions of {string}', async (actor: Author, title: string) => {
  await actor.attemptsTo(listEditions(title));
});

Then(
  '{string} has these editions:',
  async function (this: IndieWriterWorld, title: string, table: DataTable) {
    const work = await author(this).ask(theWorkTitled(title));
    assert.deepEqual(
      work.editions.map((e) => ({ number: String(e.number), label: e.label, status: e.status })),
      table.hashes(),
    );
  },
);

Then(
  'edition {int} of {string} is {string} on {string}',
  async function (
    this: IndieWriterWorld,
    number: number,
    title: string,
    status: string,
    date: string,
  ) {
    const work = await author(this).ask(theWorkTitled(title));
    const edition = work.editions.find((e) => e.number === number);
    assert.ok(edition, `no edition ${number}`);
    assert.equal(edition.status, status);
    assert.equal(edition.publishedOn, date);
  },
);

Then(
  '{string} has exactly {int} published edition',
  async function (this: IndieWriterWorld, title: string, count: number) {
    const work = await author(this).ask(theWorkTitled(title));
    assert.equal(work.editions.filter((e) => e.status === 'published').length, count);
  },
);

Then(
  'the edition listing shows these numbers:',
  function (this: IndieWriterWorld, table: DataTable) {
    assert.deepEqual(
      author(this)
        .ask(theListedEditions())
        .map((e) => String(e.number)),
      table.hashes().map((row) => row['number']),
    );
  },
);

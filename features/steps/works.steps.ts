import assert from 'node:assert/strict';

import { Given, Then, When, type DataTable } from '@cucumber/cucumber';
import type { Actor } from '@cucumber/screenplay';

import {
  theCatalog,
  theListedWorks,
  theOutcome,
  theWorkTitled,
} from '../screenplay/questions/works.questions.ts';
import {
  addWork,
  getWork,
  listWorks,
  removeWork,
  removeWorkById,
  updateWork,
} from '../screenplay/tasks/works.tasks.ts';
import { AUTHOR, type IndieWriterWorld } from '../support/world.ts';

type Author = Actor<IndieWriterWorld>;
const author = (world: IndieWriterWorld): Author => world.findOrCreateActor(AUTHOR) as Author;
const titles = (table: DataTable): string[] => table.hashes().map((row) => row['title'] as string);

When('{actor} adds a work titled {string}', async (actor: Author, title: string) => {
  await actor.attemptsTo(addWork({ title }));
});

When(
  '{actor} adds a work titled {string} with subtitle {string} and synopsis {string}',
  async (actor: Author, title: string, subtitle: string, synopsis: string) => {
    await actor.attemptsTo(addWork({ title, subtitle, synopsis }));
  },
);

When(
  '{actor} adds a work with a title of {int} characters',
  async (actor: Author, length: number) => {
    await actor.attemptsTo(addWork({ title: 'x'.repeat(length) }));
  },
);

Given('{actor} has a work titled {string}', async (actor: Author, title: string) => {
  const outcome = await actor.attemptsTo(addWork({ title }));
  assert.equal(outcome.status, 'success', 'setup must not fail');
});

Given(
  '{actor} has a work titled {string} with subtitle {string}',
  async (actor: Author, title: string, subtitle: string) => {
    const outcome = await actor.attemptsTo(addWork({ title, subtitle }));
    assert.equal(outcome.status, 'success', 'setup must not fail');
  },
);

When(
  '{actor} updates the work {string} with title {string} and synopsis {string}',
  async (actor: Author, current: string, title: string, synopsis: string) => {
    await actor.attemptsTo(updateWork(current, { title, synopsis }));
  },
);

When(
  '{actor} updates the work {string} with subtitle {string}',
  async (actor: Author, title: string, subtitle: string) => {
    await actor.attemptsTo(updateWork(title, { subtitle }));
  },
);

When(
  '{actor} marks the work {string} as {string}',
  async (actor: Author, title: string, status: string) => {
    await actor.attemptsTo(updateWork(title, { status }));
  },
);

Given(
  '{actor} has marked the work {string} as {string}',
  async (actor: Author, title: string, status: string) => {
    const outcome = await actor.attemptsTo(updateWork(title, { status }));
    assert.equal(outcome.status, 'success', 'setup must not fail');
  },
);

When('{actor} lists the works with status {string}', async (actor: Author, status: string) => {
  await actor.attemptsTo(listWorks(status));
});

When('{actor} asks for the work with id {string}', async (actor: Author, id: string) => {
  await actor.attemptsTo(getWork(id));
});

When('{actor} removes the work {string}', async (actor: Author, title: string) => {
  await actor.attemptsTo(removeWork(title));
});

When('{actor} removes the work with id {string}', async (actor: Author, id: string) => {
  await actor.attemptsTo(removeWorkById(id));
});

Then('the work {string} is a draft', async function (this: IndieWriterWorld, title: string) {
  assert.equal((await author(this).ask(theWorkTitled(title))).status, 'draft');
});

Then(
  'the work {string} is {string}',
  async function (this: IndieWriterWorld, title: string, status: string) {
    assert.equal((await author(this).ask(theWorkTitled(title))).status, status);
  },
);

Then(
  'the work {string} has subtitle {string}',
  async function (this: IndieWriterWorld, title: string, subtitle: string) {
    assert.equal((await author(this).ask(theWorkTitled(title))).subtitle, subtitle);
  },
);

Then(
  'the work {string} has synopsis {string}',
  async function (this: IndieWriterWorld, title: string, synopsis: string) {
    assert.equal((await author(this).ask(theWorkTitled(title))).synopsis, synopsis);
  },
);

Then('the work {string} has no subtitle', async function (this: IndieWriterWorld, title: string) {
  assert.equal((await author(this).ask(theWorkTitled(title))).subtitle, undefined);
});

Then('the catalog lists the works:', async function (this: IndieWriterWorld, table: DataTable) {
  const catalog = await author(this).ask(theCatalog());
  assert.deepEqual(
    catalog.map((work) => work.title),
    titles(table),
  );
});

Then('the catalog is empty', async function (this: IndieWriterWorld) {
  assert.deepEqual(await author(this).ask(theCatalog()), []);
});

Then('the catalog listing shows the works:', function (this: IndieWriterWorld, table: DataTable) {
  const a = author(this);
  assert.equal(a.ask(theOutcome()).status, 'success');
  assert.deepEqual(
    a.ask(theListedWorks()).map((work) => work.title),
    titles(table),
  );
});

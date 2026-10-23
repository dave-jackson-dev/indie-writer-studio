import assert from 'node:assert/strict';

import { Given, Then, When, type DataTable } from '@cucumber/cucumber';
import type { Actor } from '@cucumber/screenplay';

import {
  theCatalogInvitation,
  theCatalogRows,
  theEditionRows,
  theEditionsInvitation,
  theNotices,
  theOutline,
  theOutlineInvitation,
  theWindowTitle,
} from '../screenplay/window/questions.ts';
import {
  addEditionInWindow,
  addOutlineNodeInWindow,
  addWorkInWindow,
  closeAndReopenTheWriter,
  filterCatalogByStatus,
  haveTextWrittenInto,
  openTheWriter,
  publishEditionInWindow,
  removeOutlineNodeInWindow,
  removeWorkInWindow,
  retitleWorkInWindow,
  selectWorkInWindow,
  setWorkStatusInWindow,
} from '../screenplay/window/tasks.ts';
import type { WriterWorld } from '../window-support/world.ts';

type Author = Actor<WriterWorld>;

/** The window answers asynchronously, so a Then-step looks until it sees what it expects or gives up. */
async function eventually<T>(look: () => Promise<T>, check: (seen: T) => void): Promise<void> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    const seen = await look();
    try {
      check(seen);
      return;
    } catch (error) {
      if (Date.now() > deadline) throw error;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
}

Given('{actor} has opened the Writer', async (actor: Author) => {
  await actor.attemptsTo(openTheWriter());
});

When('{actor} closes the Writer and opens it again', async (actor: Author) => {
  await actor.attemptsTo(closeAndReopenTheWriter());
});

// --- the catalog ---------------------------------------------------------------------------------

Then('the window is titled {string}', async function (this: WriterWorld, title: string) {
  const actor = this.findOrCreateActor('Ada') as Author;
  assert.equal(await actor.ask(theWindowTitle()), title);
});

Then('the catalog shows no works', async function (this: WriterWorld) {
  const actor = this.findOrCreateActor('Ada') as Author;
  await eventually(
    () => actor.ask(theCatalogRows()),
    (rows) => assert.deepEqual(rows, []),
  );
});

Then('the catalog invites Ada to add her first Work', async function (this: WriterWorld) {
  const actor = this.findOrCreateActor('Ada') as Author;
  await eventually(
    () => actor.ask(theCatalogInvitation()),
    (texts) => assert.match(texts.join(' '), /add (your|a) (first )?work/i),
  );
});

When(
  '{actor} adds the work {string} with subtitle {string} in the window',
  async (actor: Author, title: string, subtitle: string) => {
    await actor.attemptsTo(addWorkInWindow({ title, subtitle }));
  },
);

When('{actor} adds the work {string} in the window', async (actor: Author, title: string) => {
  await actor.attemptsTo(addWorkInWindow({ title }));
});

Given('{actor} has a work titled {string} in the window', async (actor: Author, title: string) => {
  await actor.attemptsTo(addWorkInWindow({ title }));
  await eventually(
    () => actor.ask(theCatalogRows()),
    (rows) => assert.ok(rows.some((row) => row.title === title)),
  );
});

Then(
  'the catalog shows the work {string} as {string}',
  async function (this: WriterWorld, title: string, status: string) {
    const actor = this.findOrCreateActor('Ada') as Author;
    await eventually(
      () => actor.ask(theCatalogRows()),
      (rows) =>
        assert.ok(
          rows.some((row) => row.title === title && row.status === status),
          `Expected "${title}" as ${status}; the catalog shows ${JSON.stringify(rows)}`,
        ),
    );
  },
);

Then(
  'the catalog shows the subtitle {string} for the work {string}',
  async function (this: WriterWorld, subtitle: string, title: string) {
    const actor = this.findOrCreateActor('Ada') as Author;
    await eventually(
      () => actor.ask(theCatalogRows()),
      (rows) => assert.equal(rows.find((row) => row.title === title)?.subtitle, subtitle),
    );
  },
);

Then('a notice says {string}', async function (this: WriterWorld, word: string) {
  const actor = this.findOrCreateActor('Ada') as Author;
  await eventually(
    () => actor.ask(theNotices()),
    (notices) => assert.match(notices.join(' ').toLowerCase(), new RegExp(word.toLowerCase())),
  );
});

When(
  '{actor} marks the work {string} as {string} in the window',
  async (actor: Author, title: string, status: string) => {
    await actor.attemptsTo(setWorkStatusInWindow(title, status));
  },
);

Given(
  '{actor} marks the work {string} as {string} in the window',
  async (actor: Author, title: string, status: string) => {
    await actor.attemptsTo(setWorkStatusInWindow(title, status));
  },
);

When(
  '{actor} retitles the work {string} to {string} in the window',
  async (actor: Author, title: string, newTitle: string) => {
    await actor.attemptsTo(retitleWorkInWindow(title, newTitle));
  },
);

Then(
  'the catalog does not show the work {string}',
  async function (this: WriterWorld, title: string) {
    const actor = this.findOrCreateActor('Ada') as Author;
    await eventually(
      () => actor.ask(theCatalogRows()),
      (rows) => assert.ok(!rows.some((row) => row.title === title)),
    );
  },
);

When('{actor} filters the catalog by {string}', async (actor: Author, status: string) => {
  await actor.attemptsTo(filterCatalogByStatus(status));
});

Then('the catalog shows only the works:', async function (this: WriterWorld, table: DataTable) {
  const actor = this.findOrCreateActor('Ada') as Author;
  const expected = table.hashes().map((row) => row['title']);
  await eventually(
    () => actor.ask(theCatalogRows()),
    (rows) =>
      assert.deepEqual(
        rows.map((row) => row.title),
        expected,
      ),
  );
});

When(
  '{actor} asks to remove the work {string} but cancels',
  async (actor: Author, title: string) => {
    await actor.attemptsTo(removeWorkInWindow(title, false));
  },
);

When('{actor} removes the work {string} and confirms', async (actor: Author, title: string) => {
  await actor.attemptsTo(removeWorkInWindow(title, true));
});

// --- editions ------------------------------------------------------------------------------------

When('{actor} selects the work {string}', async (actor: Author, title: string) => {
  await actor.attemptsTo(selectWorkInWindow(title));
});

Given('{actor} selects the work {string}', async (actor: Author, title: string) => {
  await actor.attemptsTo(selectWorkInWindow(title));
});

Then('the Editions panel shows no editions', async function (this: WriterWorld) {
  const actor = this.findOrCreateActor('Ada') as Author;
  await eventually(
    () => actor.ask(theEditionsInvitation()),
    (texts) => assert.match(texts.join(' '), /no editions/i),
  );
});

When(
  '{actor} adds an edition labelled {string} in the window',
  async (actor: Author, label: string) => {
    await actor.attemptsTo(addEditionInWindow(label));
  },
);

Given(
  '{actor} has added the editions {string} and {string} to the work {string} in the window',
  async (actor: Author, first: string, second: string, title: string) => {
    await actor.attemptsTo(selectWorkInWindow(title));
    await actor.attemptsTo(addEditionInWindow(first));
    await actor.attemptsTo(addEditionInWindow(second));
  },
);

Given(
  '{actor} has added the editions {string} to the work {string} in the window',
  async (actor: Author, label: string, title: string) => {
    await actor.attemptsTo(selectWorkInWindow(title));
    await actor.attemptsTo(addEditionInWindow(label));
  },
);

When(
  '{actor} publishes edition {int} on {string} in the window',
  async (actor: Author, number: number, date: string) => {
    await actor.attemptsTo(publishEditionInWindow(number, date));
  },
);

Then(
  'the Editions panel shows edition {int} {string} as {string}',
  async function (this: WriterWorld, number: number, label: string, status: string) {
    const actor = this.findOrCreateActor('Ada') as Author;
    await eventually(
      () => actor.ask(theEditionRows()),
      (rows) =>
        assert.ok(
          rows.some((row) => row.number === number && row.label === label && row.status === status),
          `Expected edition ${number} "${label}" as ${status}; the panel shows ${JSON.stringify(rows)}`,
        ),
    );
  },
);

// --- the manuscript outline ----------------------------------------------------------------------

Then('the outline shows no sections', async function (this: WriterWorld) {
  const actor = this.findOrCreateActor('Ada') as Author;
  await eventually(
    () => actor.ask(theOutline()),
    (entries) => assert.deepEqual(entries, []),
  );
  assert.match((await actor.ask(theOutlineInvitation())).join(' '), /no sections|empty/i);
});

When(
  '{actor} adds a chapter titled {string} to the outline',
  async (actor: Author, title: string) => {
    await actor.attemptsTo(addOutlineNodeInWindow({ kind: 'chapter', title }));
  },
);

Given(
  '{actor} has added a chapter titled {string} to the outline',
  async (actor: Author, title: string) => {
    await actor.attemptsTo(addOutlineNodeInWindow({ kind: 'chapter', title }));
    await eventually(
      () => actor.ask(theOutline()),
      (entries) => assert.ok(entries.some((entry) => entry.title === title)),
    );
  },
);

Given(
  '{actor} has added a chapter titled {string} with the text {string} to the outline',
  async (actor: Author, title: string, text: string) => {
    await actor.attemptsTo(addOutlineNodeInWindow({ kind: 'chapter', title }));
    await actor.attemptsTo(haveTextWrittenInto(title, text));
    await actor.attemptsTo(selectWorkInWindow('The Salt Road'));
  },
);

When(
  '{actor} adds a scene titled {string} under {string}',
  async (actor: Author, title: string, parent: string) => {
    await actor.attemptsTo(addOutlineNodeInWindow({ kind: 'scene', title, parent }));
  },
);

Given(
  '{actor} has added a scene titled {string} under {string}',
  async (actor: Author, title: string, parent: string) => {
    await actor.attemptsTo(addOutlineNodeInWindow({ kind: 'scene', title, parent }));
    await eventually(
      () => actor.ask(theOutline()),
      (entries) => assert.ok(entries.some((entry) => entry.title === title)),
    );
  },
);

Then('the outline shows {string} as a chapter', async function (this: WriterWorld, title: string) {
  const actor = this.findOrCreateActor('Ada') as Author;
  await eventually(
    () => actor.ask(theOutline()),
    (entries) =>
      assert.ok(entries.some((entry) => entry.title === title && entry.kind === 'chapter')),
  );
});

Then(
  'the outline shows {string} as a scene under {string}',
  async function (this: WriterWorld, title: string, parent: string) {
    const actor = this.findOrCreateActor('Ada') as Author;
    await eventually(
      () => actor.ask(theOutline()),
      (entries) =>
        assert.ok(
          entries.some(
            (entry) => entry.title === title && entry.kind === 'scene' && entry.parent === parent,
          ),
          JSON.stringify(entries),
        ),
    );
  },
);

Then(
  'the outline shows {int} words for {string}',
  async function (this: WriterWorld, words: number, title: string) {
    const actor = this.findOrCreateActor('Ada') as Author;
    await eventually(
      () => actor.ask(theOutline()),
      (entries) => assert.equal(entries.find((entry) => entry.title === title)?.words, words),
    );
  },
);

When(
  '{actor} removes {string} from the outline and confirms',
  async (actor: Author, title: string) => {
    await actor.attemptsTo(removeOutlineNodeInWindow(title));
  },
);

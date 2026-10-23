import assert from 'node:assert/strict';

import { Then, When } from '@cucumber/cucumber';
import type { Actor } from '@cucumber/screenplay';

import { theOutcome } from '../screenplay/questions/works.questions.ts';
import { checkSystemHealth, operate, restartApp } from '../screenplay/tasks/works.tasks.ts';
import { AUTHOR, type IndieWriterWorld } from '../support/world.ts';

type Author = Actor<IndieWriterWorld>;

const author = (world: IndieWriterWorld): Author => world.findOrCreateActor(AUTHOR) as Author;

When('{actor} checks the system health', async (actor: Author) => {
  await actor.attemptsTo(checkSystemHealth());
});

When('{actor} runs the operation {string}', async (actor: Author, operation: string) => {
  await actor.attemptsTo(operate(operation));
});

When('the app is restarted', async function (this: IndieWriterWorld) {
  await author(this).attemptsTo(restartApp());
});

Then('the outcome is a success', function (this: IndieWriterWorld) {
  const outcome = author(this).ask(theOutcome());
  assert.equal(outcome.status, 'success', JSON.stringify(outcome.error));
});

Then('the outcome is an error with code {string}', function (this: IndieWriterWorld, code: string) {
  const outcome = author(this).ask(theOutcome());
  assert.equal(outcome.status, 'error');
  assert.equal(outcome.error?.code, code);
});

Then('the exit code is {int}', function (this: IndieWriterWorld, exitCode: number) {
  assert.equal(author(this).ask(theOutcome()).exitCode, exitCode);
});

Then(
  'the system reports status {string} for service {string}',
  function (this: IndieWriterWorld, status: string, service: string) {
    const data = author(this).ask(theOutcome()).data as { status: string; service: string };
    assert.equal(data.status, status);
    assert.equal(data.service, service);
  },
);

Then('the system reports the component {string}', function (this: IndieWriterWorld, name: string) {
  const data = author(this).ask(theOutcome()).data as { components: string[] };
  assert.ok(data.components.includes(name), `components were: ${data.components.join(', ')}`);
});

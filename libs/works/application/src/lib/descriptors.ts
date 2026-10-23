import {
  defineOperation,
  describeValue,
  invalidInput,
  requiredString,
  type OperationInputSchema,
  type ToolOperationDescriptor,
} from '@indie-writer-studio/cqrs-tool-runtime';
import { WORK_STATUSES, type WorkPatch, type WorkStatus } from '@indie-writer-studio/works-domain';

import {
  AddEditionCommand,
  AddWorkCommand,
  GetWorkQuery,
  ListEditionsQuery,
  ListWorksQuery,
  PublishEditionCommand,
  RemoveWorkCommand,
  UpdateWorkCommand,
} from './requests.js';

/**
 * A string that may be empty: the domain, not the transport, decides what a blank title or a
 * cleared subtitle means, so the error carries the domain's code.
 */
function text(input: Record<string, unknown>, key: string, operation: string): string | undefined {
  const value = input[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    invalidInput(`${operation}'s '${key}' must be a string; received ${describeValue(value)}.`);
  }
  return value as string;
}

function requiredText(input: Record<string, unknown>, key: string, operation: string): string {
  const value = text(input, key, operation);
  if (value === undefined) invalidInput(`${operation} needs a string '${key}'.`);
  return value as string;
}

function positiveInteger(input: Record<string, unknown>, key: string, operation: string): number {
  const value = input[key];
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    invalidInput(
      `${operation} needs a whole number '${key}' of 1 or more; received ${describeValue(value)}.`,
    );
  }
  return value as number;
}

const string = (description: string): OperationInputSchema => ({ type: 'string', description });
const status: OperationInputSchema = {
  type: 'string',
  enum: [...WORK_STATUSES],
  description: 'draft, in-progress or complete.',
};
const object = (
  properties: Record<string, OperationInputSchema>,
  required: string[] = [],
): OperationInputSchema => ({ type: 'object', properties, required });

export const createWorksToolOperations = (): readonly ToolOperationDescriptor[] => [
  defineOperation({
    name: 'works.work.add',
    summary: 'Add a Work to the catalog as a draft',
    kind: 'command',
    inputSchema: object(
      {
        title: string('The Work’s title, up to 200 characters.'),
        subtitle: string('An optional subtitle.'),
        synopsis: string('An optional synopsis, up to 5000 characters.'),
      },
      ['title'],
    ),
    validate: (input) => ({
      title: requiredText(input, 'title', 'works.work.add'),
      subtitle: text(input, 'subtitle', 'works.work.add'),
      synopsis: text(input, 'synopsis', 'works.work.add'),
    }),
    createRequest: (input) => new AddWorkCommand(input.title, input.subtitle, input.synopsis),
  }),
  defineOperation({
    name: 'works.work.get',
    summary: 'Get one Work with its Editions',
    kind: 'query',
    inputSchema: object({ id: string('The Work’s id.') }, ['id']),
    validate: (input) => ({ id: requiredString(input, 'id', 'works.work.get') }),
    createRequest: (input) => new GetWorkQuery(input.id),
  }),
  defineOperation({
    name: 'works.work.list',
    summary: 'List the Works in the order they were added, optionally by status',
    kind: 'query',
    inputSchema: object({ status }),
    validate: (input) => ({ status: text(input, 'status', 'works.work.list') }),
    createRequest: (input) => new ListWorksQuery(input.status),
  }),
  defineOperation({
    name: 'works.work.update',
    summary:
      'Change a Work’s title, subtitle, synopsis or status; an empty subtitle or synopsis clears it',
    kind: 'command',
    inputSchema: object(
      {
        id: string('The Work’s id.'),
        title: string('A new title.'),
        subtitle: string('A new subtitle; empty clears it.'),
        synopsis: string('A new synopsis; empty clears it.'),
        status,
      },
      ['id'],
    ),
    validate: (input) => {
      const patch: { -readonly [K in keyof WorkPatch]: WorkPatch[K] } = {};
      const title = text(input, 'title', 'works.work.update');
      const subtitle = text(input, 'subtitle', 'works.work.update');
      const synopsis = text(input, 'synopsis', 'works.work.update');
      const state = text(input, 'status', 'works.work.update');
      if (title !== undefined) patch.title = title;
      if (subtitle !== undefined) patch.subtitle = subtitle;
      if (synopsis !== undefined) patch.synopsis = synopsis;
      if (state !== undefined) patch.status = state as WorkStatus;
      return { id: requiredString(input, 'id', 'works.work.update'), patch };
    },
    createRequest: (input) => new UpdateWorkCommand(input.id, input.patch),
  }),
  defineOperation({
    name: 'works.work.remove',
    summary: 'Remove a Work and its Editions from the catalog',
    kind: 'command',
    inputSchema: object({ id: string('The Work’s id.') }, ['id']),
    validate: (input) => ({ id: requiredString(input, 'id', 'works.work.remove') }),
    createRequest: (input) => new RemoveWorkCommand(input.id),
  }),
  defineOperation({
    name: 'works.edition.add',
    summary: 'Add the next numbered draft Edition to a Work',
    kind: 'command',
    inputSchema: object(
      {
        'work-id': string('The Work’s id.'),
        label: string('A label; defaults to “Edition N”.'),
        notes: string('Optional notes about this revision.'),
      },
      ['work-id'],
    ),
    validate: (input) => ({
      workId: requiredString(input, 'work-id', 'works.edition.add'),
      label: text(input, 'label', 'works.edition.add'),
      notes: text(input, 'notes', 'works.edition.add'),
    }),
    createRequest: (input) => new AddEditionCommand(input.workId, input.label, input.notes),
  }),
  defineOperation({
    name: 'works.edition.publish',
    summary: 'Publish a draft Edition, superseding the one that was published',
    kind: 'command',
    inputSchema: object(
      {
        'work-id': string('The Work’s id.'),
        number: { type: 'integer', description: 'The Edition number.' },
        'published-on': string('YYYY-MM-DD; defaults to today.'),
      },
      ['work-id', 'number'],
    ),
    validate: (input) => ({
      workId: requiredString(input, 'work-id', 'works.edition.publish'),
      number: positiveInteger(input, 'number', 'works.edition.publish'),
      publishedOn: text(input, 'published-on', 'works.edition.publish'),
    }),
    createRequest: (input) =>
      new PublishEditionCommand(input.workId, input.number, input.publishedOn),
  }),
  defineOperation({
    name: 'works.edition.list',
    summary: 'List a Work’s Editions in number order',
    kind: 'query',
    inputSchema: object({ 'work-id': string('The Work’s id.') }, ['work-id']),
    validate: (input) => ({ workId: requiredString(input, 'work-id', 'works.edition.list') }),
    createRequest: (input) => new ListEditionsQuery(input.workId),
  }),
];

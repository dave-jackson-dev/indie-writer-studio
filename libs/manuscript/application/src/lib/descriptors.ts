import {
  defineOperation,
  describeValue,
  invalidInput,
  requiredString,
  type OperationInputSchema,
  type ToolOperationDescriptor,
} from '@indie-writer-studio/cqrs-tool-runtime';
import { MATTERS, NODE_KINDS } from '@indie-writer-studio/manuscript-domain';

import {
  AddNodeCommand,
  GetNodeQuery,
  GetOutlineQuery,
  MoveNodeCommand,
  RemoveNodeCommand,
  UpdateNodeCommand,
} from './requests.js';

/**
 * A string that may be empty: the domain, not the transport, decides what a blank title or an
 * emptied text means, so the refusal carries the domain's code.
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

function position(input: Record<string, unknown>, operation: string): number | undefined {
  const value = input['position'];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    invalidInput(
      `${operation}'s 'position' must be a whole number of 0 or more; received ${describeValue(value)}.`,
    );
  }
  return value as number;
}

const string = (description: string): OperationInputSchema => ({ type: 'string', description });
const workId = string('The Work’s id.');
const nodeId = string('The node’s id.');
const matter: OperationInputSchema = {
  type: 'string',
  enum: [...MATTERS],
  description:
    'front, main or back; with no parent, the node goes at the top level of this matter.',
};
const parentId = string('Put the node under this node instead of at the top level of a matter.');
const positionSchema: OperationInputSchema = {
  type: 'integer',
  description: 'Index among the new siblings; defaults to the end.',
};
const object = (
  properties: Record<string, OperationInputSchema>,
  required: string[] = [],
): OperationInputSchema => ({ type: 'object', properties, required });

export const createManuscriptToolOperations = (): readonly ToolOperationDescriptor[] => [
  defineOperation({
    name: 'manuscript.node.add',
    summary: 'Add a part, chapter, scene or section to a Work’s manuscript',
    kind: 'command',
    inputSchema: object(
      {
        'work-id': workId,
        kind: {
          type: 'string',
          enum: [...NODE_KINDS],
          description: 'part, chapter, scene or section.',
        },
        title: string('The node’s title, up to 200 characters.'),
        'parent-id': parentId,
        matter,
        position: positionSchema,
        body: string('The node’s Markdown text.'),
      },
      ['work-id', 'kind', 'title'],
    ),
    validate: (input) => ({
      workId: requiredString(input, 'work-id', 'manuscript.node.add'),
      kind: requiredText(input, 'kind', 'manuscript.node.add'),
      title: requiredText(input, 'title', 'manuscript.node.add'),
      body: text(input, 'body', 'manuscript.node.add'),
      parentId: text(input, 'parent-id', 'manuscript.node.add'),
      matter: text(input, 'matter', 'manuscript.node.add'),
      position: position(input, 'manuscript.node.add'),
    }),
    createRequest: (input) =>
      new AddNodeCommand(
        input.workId,
        input.kind,
        input.title,
        input.body,
        input.parentId,
        input.matter,
        input.position,
      ),
  }),
  defineOperation({
    name: 'manuscript.node.get',
    summary: 'Get one node with its text and children',
    kind: 'query',
    inputSchema: object({ 'work-id': workId, id: nodeId }, ['work-id', 'id']),
    validate: (input) => ({
      workId: requiredString(input, 'work-id', 'manuscript.node.get'),
      id: requiredString(input, 'id', 'manuscript.node.get'),
    }),
    createRequest: (input) => new GetNodeQuery(input.workId, input.id),
  }),
  defineOperation({
    name: 'manuscript.outline',
    summary: 'The structure of a Work’s manuscript with word counts, without the text',
    kind: 'query',
    inputSchema: object({ 'work-id': workId }, ['work-id']),
    validate: (input) => ({ workId: requiredString(input, 'work-id', 'manuscript.outline') }),
    createRequest: (input) => new GetOutlineQuery(input.workId),
  }),
  defineOperation({
    name: 'manuscript.node.update',
    summary: 'Change a node’s title or text',
    kind: 'command',
    inputSchema: object(
      {
        'work-id': workId,
        id: nodeId,
        title: string('A new title.'),
        body: string('The node’s whole Markdown text; empty clears it.'),
      },
      ['work-id', 'id'],
    ),
    validate: (input) => ({
      workId: requiredString(input, 'work-id', 'manuscript.node.update'),
      id: requiredString(input, 'id', 'manuscript.node.update'),
      patch: {
        title: text(input, 'title', 'manuscript.node.update'),
        body: text(input, 'body', 'manuscript.node.update'),
      },
    }),
    createRequest: (input) => new UpdateNodeCommand(input.workId, input.id, input.patch),
  }),
  defineOperation({
    name: 'manuscript.node.move',
    summary: 'Move a node, with everything beneath it, under another node or into a matter',
    kind: 'command',
    inputSchema: object(
      {
        'work-id': workId,
        id: nodeId,
        'parent-id': parentId,
        matter,
        position: positionSchema,
      },
      ['work-id', 'id'],
    ),
    validate: (input) => ({
      workId: requiredString(input, 'work-id', 'manuscript.node.move'),
      id: requiredString(input, 'id', 'manuscript.node.move'),
      destination: {
        parentId: text(input, 'parent-id', 'manuscript.node.move'),
        matter: text(input, 'matter', 'manuscript.node.move'),
        position: position(input, 'manuscript.node.move'),
      },
    }),
    createRequest: (input) => new MoveNodeCommand(input.workId, input.id, input.destination),
  }),
  defineOperation({
    name: 'manuscript.node.remove',
    summary: 'Remove a node and everything beneath it',
    kind: 'command',
    inputSchema: object({ 'work-id': workId, id: nodeId }, ['work-id', 'id']),
    validate: (input) => ({
      workId: requiredString(input, 'work-id', 'manuscript.node.remove'),
      id: requiredString(input, 'id', 'manuscript.node.remove'),
    }),
    createRequest: (input) => new RemoveNodeCommand(input.workId, input.id),
  }),
];

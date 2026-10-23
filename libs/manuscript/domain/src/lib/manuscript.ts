export const NODE_KINDS = ['part', 'chapter', 'scene', 'section'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export const MATTERS = ['front', 'main', 'back'] as const;
export type Matter = (typeof MATTERS)[number];

/** A part, chapter, scene or section, with the Markdown text written directly in it. */
export interface ManuscriptNode {
  readonly id: string;
  readonly kind: NodeKind;
  readonly title: string;
  readonly body: string;
  readonly children: readonly ManuscriptNode[];
}

/** The text of one Work: front matter, the main text and back matter, each a list of nodes. */
export interface Manuscript {
  readonly workId: string;
  readonly front: readonly ManuscriptNode[];
  readonly main: readonly ManuscriptNode[];
  readonly back: readonly ManuscriptNode[];
}

export type ManuscriptErrorCode =
  'INVALID_NODE' | 'INVALID_PLACEMENT' | 'NODE_NOT_FOUND' | 'INVALID_WORK_ID';

export class ManuscriptDomainError extends Error {
  constructor(
    public readonly code: ManuscriptErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ManuscriptDomainError';
  }
}

export const TITLE_MAX = 200;
export const BODY_MAX = 2_000_000;
/** Levels of nesting a node may sit at, counting its matter's top level as 1. */
export const MAX_DEPTH = 6;

/** What each kind may hold. A scene is a leaf; a section holds only sections. */
const CHILDREN: Record<NodeKind, readonly NodeKind[]> = {
  part: ['chapter', 'section'],
  chapter: ['scene', 'section'],
  scene: [],
  section: ['section'],
};

/** What may stand at the top level of each matter. Parts belong to the main text only. */
const TOP_LEVEL: Record<Matter, readonly NodeKind[]> = {
  front: ['chapter', 'section'],
  main: ['part', 'chapter', 'section'],
  back: ['chapter', 'section'],
};

const WORK_ID = /^[A-Za-z0-9_-]{1,100}$/;

/**
 * A work id arrives from outside and ends up in a file name, so it is held to a safe alphabet:
 * letters, digits, hyphen and underscore. Real ids are UUIDs.
 */
export function parseWorkId(value: string): string {
  if (!WORK_ID.test(value)) {
    throw new ManuscriptDomainError(
      'INVALID_WORK_ID',
      'A work id is 1 to 100 letters, digits, hyphens or underscores.',
    );
  }
  return value;
}

export function emptyManuscript(workId: string): Manuscript {
  return { workId: parseWorkId(workId), front: [], main: [], back: [] };
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => word !== '').length;
}

const invalidNode = (message: string): never => {
  throw new ManuscriptDomainError('INVALID_NODE', message);
};
const invalidPlacement = (message: string): never => {
  throw new ManuscriptDomainError('INVALID_PLACEMENT', message);
};

function parseKind(value: string): NodeKind {
  if (!(NODE_KINDS as readonly string[]).includes(value)) {
    return invalidNode(`'${value}' is not a kind; use one of ${NODE_KINDS.join(', ')}.`);
  }
  return value as NodeKind;
}

function parseTitle(value: string): string {
  const title = value.trim();
  if (title === '') return invalidNode('A node needs a title.');
  if (title.length > TITLE_MAX) {
    return invalidNode(`A title cannot be longer than ${TITLE_MAX} characters.`);
  }
  return title;
}

function parseBody(value: string): string {
  if (value.length > BODY_MAX) {
    return invalidNode(`A node's text cannot be longer than ${BODY_MAX} characters.`);
  }
  return value;
}

function parseMatter(value: string): Matter {
  if (!(MATTERS as readonly string[]).includes(value)) {
    return invalidPlacement(`'${value}' is not a matter; use one of ${MATTERS.join(', ')}.`);
  }
  return value as Matter;
}

interface Found {
  readonly matter: Matter;
  /** From the top-level node down to the node itself. */
  readonly trail: readonly ManuscriptNode[];
}

function findIn(nodes: readonly ManuscriptNode[], id: string): ManuscriptNode[] | undefined {
  for (const node of nodes) {
    if (node.id === id) return [node];
    const inner = findIn(node.children, id);
    if (inner) return [node, ...inner];
  }
  return undefined;
}

function locate(manuscript: Manuscript, id: string): Found | undefined {
  for (const matter of MATTERS) {
    const trail = findIn(manuscript[matter], id);
    if (trail) return { matter, trail };
  }
  return undefined;
}

export function findNode(manuscript: Manuscript, id: string): ManuscriptNode | undefined {
  return locate(manuscript, id)?.trail.at(-1);
}

/** The node, or a NODE_NOT_FOUND refusal. */
export function getNode(manuscript: Manuscript, id: string): ManuscriptNode {
  return mustLocate(manuscript, id).trail.at(-1) as ManuscriptNode;
}

function mustLocate(manuscript: Manuscript, id: string): Found {
  const found = locate(manuscript, id);
  if (!found)
    throw new ManuscriptDomainError('NODE_NOT_FOUND', `There is no node with id '${id}'.`);
  return found;
}

const height = (node: ManuscriptNode): number =>
  1 + node.children.reduce((tallest, child) => Math.max(tallest, height(child)), 0);

/** Replaces one node by whatever `change` returns for it, or drops it when `change` returns undefined. */
function rewrite(
  nodes: readonly ManuscriptNode[],
  id: string,
  change: (node: ManuscriptNode) => ManuscriptNode | undefined,
): ManuscriptNode[] {
  return nodes.flatMap((node) => {
    if (node.id === id) {
      const next = change(node);
      return next === undefined ? [] : [next];
    }
    return [{ ...node, children: rewrite(node.children, id, change) }];
  });
}

const onMatters = (
  manuscript: Manuscript,
  change: (nodes: readonly ManuscriptNode[]) => readonly ManuscriptNode[],
): Manuscript => ({
  ...manuscript,
  front: change(manuscript.front),
  main: change(manuscript.main),
  back: change(manuscript.back),
});

function insertAt(
  nodes: readonly ManuscriptNode[],
  node: ManuscriptNode,
  position: number | undefined,
): ManuscriptNode[] {
  const at = position ?? nodes.length;
  if (!Number.isInteger(at) || at < 0 || at > nodes.length) {
    return invalidPlacement(`Position ${String(position)} is outside 0 to ${nodes.length}.`);
  }
  return [...nodes.slice(0, at), node, ...nodes.slice(at)];
}

export interface Destination {
  /** Put the node under this node... */
  readonly parentId?: string | undefined;
  /** ...or at the top level of this matter. Not both. */
  readonly matter?: string | undefined;
  /** Index among the new siblings; defaults to the end. */
  readonly position?: number | undefined;
}

/** Puts `node` where `destination` says, in a manuscript that no longer holds it. */
function place(manuscript: Manuscript, node: ManuscriptNode, destination: Destination): Manuscript {
  if (destination.parentId !== undefined && destination.matter !== undefined) {
    return invalidPlacement('Give a parent or a matter, not both.');
  }
  if (destination.parentId !== undefined) {
    const { trail } = mustLocate(manuscript, destination.parentId);
    const parent = trail.at(-1) as ManuscriptNode;
    if (!CHILDREN[parent.kind].includes(node.kind)) {
      return invalidPlacement(`A ${parent.kind} cannot hold a ${node.kind}.`);
    }
    if (trail.length + height(node) > MAX_DEPTH) {
      return invalidPlacement(`Nodes cannot nest deeper than ${MAX_DEPTH} levels.`);
    }
    const inserted = insertAt(parent.children, node, destination.position);
    return onMatters(manuscript, (nodes) =>
      rewrite(nodes, parent.id, (p) => ({ ...p, children: inserted })),
    );
  }
  const matter = parseMatter(destination.matter ?? 'main');
  if (!TOP_LEVEL[matter].includes(node.kind)) {
    return invalidPlacement(`The ${matter} matter cannot hold a ${node.kind} at its top level.`);
  }
  const inserted = insertAt(manuscript[matter], node, destination.position);
  return { ...manuscript, [matter]: inserted };
}

export interface NewNode extends Destination {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly body?: string | undefined;
}

export function addNode(manuscript: Manuscript, input: NewNode): Manuscript {
  if (input.id === '') invalidNode('A node needs an id.');
  if (locate(manuscript, input.id)) invalidNode(`A node with id '${input.id}' already exists.`);
  const node: ManuscriptNode = {
    id: input.id,
    kind: parseKind(input.kind),
    title: parseTitle(input.title),
    body: parseBody(input.body ?? ''),
    children: [],
  };
  return place(manuscript, node, input);
}

export interface NodePatch {
  readonly title?: string | undefined;
  readonly body?: string | undefined;
}

export function updateNode(manuscript: Manuscript, id: string, patch: NodePatch): Manuscript {
  mustLocate(manuscript, id);
  const title = patch.title === undefined ? undefined : parseTitle(patch.title);
  const body = patch.body === undefined ? undefined : parseBody(patch.body);
  return onMatters(manuscript, (nodes) =>
    rewrite(nodes, id, (node) => ({
      ...node,
      ...(title === undefined ? {} : { title }),
      ...(body === undefined ? {} : { body }),
    })),
  );
}

/** Removes a node and everything beneath it. */
export function removeNode(manuscript: Manuscript, id: string): Manuscript {
  mustLocate(manuscript, id);
  return onMatters(manuscript, (nodes) => rewrite(nodes, id, () => undefined));
}

/**
 * Moves a node, with everything beneath it. The position is an index among the new siblings
 * once the node has left its old place, so moving within one list reads naturally.
 */
export function moveNode(manuscript: Manuscript, id: string, destination: Destination): Manuscript {
  const { trail } = mustLocate(manuscript, id);
  const node = trail.at(-1) as ManuscriptNode;
  if (destination.parentId === undefined && destination.matter === undefined) {
    invalidPlacement('Say where to move it: a parent or a matter.');
  }
  if (destination.parentId !== undefined) {
    const target = mustLocate(manuscript, destination.parentId);
    if (target.trail.some((ancestor) => ancestor.id === id)) {
      invalidPlacement('A node cannot be moved into itself or beneath itself.');
    }
  }
  const without = onMatters(manuscript, (nodes) => rewrite(nodes, id, () => undefined));
  return place(without, node, destination);
}

export interface OutlineNode {
  readonly id: string;
  readonly kind: NodeKind;
  readonly title: string;
  /** Words in this node's own text. */
  readonly words: number;
  /** Words in this node's text and everything beneath it. */
  readonly totalWords: number;
  readonly children: readonly OutlineNode[];
}

export interface Outline {
  readonly front: readonly OutlineNode[];
  readonly main: readonly OutlineNode[];
  readonly back: readonly OutlineNode[];
  readonly totalWords: number;
}

function outlineNode(node: ManuscriptNode): OutlineNode {
  const children = node.children.map(outlineNode);
  const words = wordCount(node.body);
  return {
    id: node.id,
    kind: node.kind,
    title: node.title,
    words,
    totalWords: words + children.reduce((sum, child) => sum + child.totalWords, 0),
    children,
  };
}

/** The structure with word counts and without the text itself. */
export function outlineOf(manuscript: Manuscript): Outline {
  const front = manuscript.front.map(outlineNode);
  const main = manuscript.main.map(outlineNode);
  const back = manuscript.back.map(outlineNode);
  const sum = (nodes: readonly OutlineNode[]) => nodes.reduce((n, node) => n + node.totalWords, 0);
  return { front, main, back, totalWords: sum(front) + sum(main) + sum(back) };
}

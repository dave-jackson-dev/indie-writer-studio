import {
  ManuscriptWorkNotFoundError,
  type ManuscriptRepository,
} from '@indie-writer-studio/manuscript-application';
import {
  MATTERS,
  type Manuscript,
  type ManuscriptNode,
  type Matter,
  type NodeKind,
} from '@indie-writer-studio/manuscript-domain';
import {
  decode,
  encode,
  keyLiteral,
  type CascadeHooks,
  type Database,
  type Row,
  type Session,
} from '@indie-writer-studio/typedblite';

/** One node as stored: its place is its matter, its parent and its position among its siblings. */
interface StoredNode {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly body: string;
  readonly matter: Matter;
  readonly parent: string;
  readonly position: number;
}

const sameAs = (a: StoredNode, b: StoredNode): boolean =>
  a.kind === b.kind &&
  a.title === b.title &&
  a.body === b.body &&
  a.matter === b.matter &&
  a.parent === b.parent &&
  a.position === b.position;

/** A manuscript as the flat records that are stored, keyed by node id. */
function flatten(manuscript: Manuscript): Map<string, StoredNode> {
  const records = new Map<string, StoredNode>();
  const walk = (nodes: readonly ManuscriptNode[], matter: Matter, parent: string): void => {
    nodes.forEach((node, position) => {
      records.set(node.id, {
        id: node.id,
        kind: node.kind,
        title: node.title,
        body: node.body,
        matter,
        parent,
        position,
      });
      walk(node.children, matter, node.id);
    });
  };
  for (const matter of MATTERS) walk(manuscript[matter], matter, '');
  return records;
}

/** The records put back together as a tree. */
function assemble(workId: string, rows: readonly Row[]): Manuscript {
  const records: StoredNode[] = rows.map((row) => ({
    id: String(row['id']),
    kind: decode(row['kind']),
    title: decode(row['title']),
    body: decode(row['body']),
    matter: decode(row['matter']) as Matter,
    parent: String(row['parent']),
    position: Number(row['position']),
  }));
  const childrenOf = new Map<string, StoredNode[]>();
  for (const record of records) {
    const group = `${record.matter}\u0000${record.parent}`;
    childrenOf.set(group, [...(childrenOf.get(group) ?? []), record]);
  }
  const build = (matter: Matter, parent: string): ManuscriptNode[] =>
    (childrenOf.get(`${matter}\u0000${parent}`) ?? [])
      .sort((a, b) => a.position - b.position)
      .map((record) => ({
        id: record.id,
        kind: record.kind as NodeKind,
        title: record.title,
        body: record.body,
        children: build(matter, record.id),
      }));
  return {
    workId,
    front: build('front', ''),
    main: build('main', ''),
    back: build('back', ''),
  };
}

const NODE_SELECT =
  'has node-id $id, has node-kind $kind, has node-title $title, has node-body $body, has node-matter $matter, has node-parent $parent, has node-position $position';

/** The text of a stored parent id, which is an id (or empty), written like a key. */
const parentLiteral = (parent: string): string =>
  parent === '' ? '""' : (keyLiteral(parent) as string);

/**
 * Manuscripts on TypeDBLite (ADR-003). Each node is its own entity, related to its Work; a change
 * writes only the nodes that differ, in one transaction, after checking inside it that the Work
 * exists (the engine would silently ignore a relation to a Work that is not there). Removing a Work
 * removes its nodes, through a cascade hook that runs in the Work's own removal transaction.
 */
export class TypeDBLiteManuscriptRepository implements ManuscriptRepository {
  constructor(
    private readonly database: Database,
    hooks: CascadeHooks,
  ) {
    hooks.register('work', async (workId, session) => {
      const key = keyLiteral(workId);
      if (key !== undefined) {
        await session.execute(`match $n isa manuscript-node, has node-work ${key}; delete $n;`);
      }
    });
  }

  get(workId: string): Promise<Manuscript | undefined> {
    const key = keyLiteral(workId);
    if (key === undefined) return Promise.resolve(undefined);
    return this.database.read(async (session) =>
      (await this.workExists(session, key)) ? this.load(session, workId, key) : undefined,
    );
  }

  update(workId: string, change: (current: Manuscript) => Manuscript): Promise<Manuscript> {
    const key = keyLiteral(workId);
    if (key === undefined) return Promise.reject(new ManuscriptWorkNotFoundError(workId));
    return this.database.write(async (session) => {
      if (!(await this.workExists(session, key))) throw new ManuscriptWorkNotFoundError(workId);
      const current = await this.load(session, workId, key);
      const next = change(structuredClone(current));
      await this.persist(session, key, flatten(current), flatten(next));
      return next;
    });
  }

  private async workExists(session: Session, key: string): Promise<boolean> {
    return (await session.query(`match $w isa work, has work-id ${key}; select $w;`)).length > 0;
  }

  private async load(session: Session, workId: string, key: string): Promise<Manuscript> {
    const rows = await session.query(
      `match $n isa manuscript-node, has node-work ${key}, ${NODE_SELECT}; select $id, $kind, $title, $body, $matter, $parent, $position;`,
    );
    return assemble(workId, rows);
  }

  /** Deletes what is gone or changed, then inserts what is new or changed. */
  private async persist(
    session: Session,
    workKey: string,
    before: Map<string, StoredNode>,
    after: Map<string, StoredNode>,
  ): Promise<void> {
    const changed = (id: string): boolean => {
      const was = before.get(id);
      const now = after.get(id);
      return was !== undefined && now !== undefined && !sameAs(was, now);
    };
    for (const id of before.keys()) {
      if (!after.has(id) || changed(id)) {
        await session.execute(
          `match $n isa manuscript-node, has node-id ${keyLiteral(id) as string}; delete $n;`,
        );
      }
    }
    for (const [id, record] of after) {
      if (before.has(id) && !changed(id)) continue;
      const key = keyLiteral(id);
      if (key === undefined) throw new Error(`'${id}' cannot be used as a node id.`);
      await session.execute(
        `insert $n isa manuscript-node, has node-id ${key}, has node-work ${workKey}, has node-kind ${encode(record.kind)}, ` +
          `has node-title ${encode(record.title)}, has node-body ${encode(record.body)}, has node-matter ${encode(record.matter)}, ` +
          `has node-parent ${parentLiteral(record.parent)}, has node-position ${record.position};`,
      );
      await session.execute(
        `match $w isa work, has work-id ${workKey}; $n isa manuscript-node, has node-id ${key}; insert (work: $w, node: $n) isa manuscript-of;`,
      );
    }
  }
}

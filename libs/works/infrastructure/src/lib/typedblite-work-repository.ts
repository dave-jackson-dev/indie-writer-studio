import {
  decode,
  encode,
  keyLiteral,
  type CascadeHooks,
  type Database,
  type Row,
  type Session,
} from '@indie-writer-studio/typedblite';
import type { WorkRepository } from '@indie-writer-studio/works-application';
import type { Edition, EditionStatus, Work, WorkStatus } from '@indie-writer-studio/works-domain';

const text = (value: unknown): string | undefined => {
  const decoded = decode(value);
  return decoded === '' ? undefined : decoded;
};

const keyOrThrow = (id: string): string => {
  const key = keyLiteral(id);
  if (key === undefined) throw new Error(`'${id}' cannot be used as a work id.`);
  return key;
};

function editionFrom(row: Row): Edition {
  const publishedOn = text(row['published']);
  const notes = text(row['notes']);
  return {
    number: Number(row['n']),
    label: decode(row['label']),
    status: decode(row['status']) as EditionStatus,
    ...(publishedOn === undefined ? {} : { publishedOn }),
    ...(notes === undefined ? {} : { notes }),
    createdAt: decode(row['created']),
    updatedAt: decode(row['updated']),
  };
}

const DETAILS_SELECT =
  'has work-title $t, has work-subtitle $st, has work-synopsis $sy, has work-status $s, has work-created-at $c, has work-updated-at $u';
const EDITION_SELECT =
  'has edition-number $n, has edition-label $label, has edition-status $status, has edition-published-on $published, has edition-notes $notes, has edition-created-at $created, has edition-updated-at $updated';

function workFrom(id: string, row: Row, editions: readonly Edition[]): Work {
  const subtitle = text(row['st']);
  const synopsis = text(row['sy']);
  return {
    id,
    title: decode(row['t']),
    ...(subtitle === undefined ? {} : { subtitle }),
    ...(synopsis === undefined ? {} : { synopsis }),
    status: decode(row['s']) as WorkStatus,
    editions: [...editions].sort((a, b) => a.number - b.number),
    createdAt: decode(row['c']),
    updatedAt: decode(row['u']),
  };
}

/**
 * The works catalog on TypeDBLite (ADR-003). A work is an identity (`work`) with replaceable
 * `work-details` and `edition`s linked to it; every change is one transaction, so it applies whole
 * or not at all, and removing a work runs the cascade hooks of whatever depends on it in the same
 * transaction.
 */
export class TypeDBLiteWorkRepository implements WorkRepository {
  constructor(
    private readonly database: Database,
    private readonly hooks: CascadeHooks,
  ) {}

  get(id: string): Promise<Work | undefined> {
    return this.database.read((session) => this.load(session, id));
  }

  list(): Promise<readonly Work[]> {
    return this.database.read(async (session) => {
      const identities = await session.query(
        'match $w isa work, has work-id $id, has work-order $o; select $id, $o;',
      );
      const details = await session.query(
        `match $d isa work-details, has work-details-key $k, ${DETAILS_SELECT}; select $k, $t, $st, $sy, $s, $c, $u;`,
      );
      const editions = await session.query(
        `match $e isa edition, has edition-work $wk, ${EDITION_SELECT}; select $wk, $n, $label, $status, $published, $notes, $created, $updated;`,
      );
      const detailsOf = new Map(details.map((row) => [String(row['k']), row]));
      const editionsOf = new Map<string, Edition[]>();
      for (const row of editions) {
        const key = String(row['wk']);
        editionsOf.set(key, [...(editionsOf.get(key) ?? []), editionFrom(row)]);
      }
      return [...identities]
        .sort((a, b) => Number(a['o']) - Number(b['o']))
        .map((row) => String(row['id']))
        .flatMap((id) => {
          const row = detailsOf.get(id);
          return row ? [workFrom(id, row, editionsOf.get(id) ?? [])] : [];
        });
    });
  }

  save(work: Work): Promise<void> {
    return this.database.write(async (session) => {
      await this.store(session, work);
    });
  }

  update(id: string, change: (work: Work) => Work): Promise<Work | undefined> {
    const key = keyLiteral(id);
    if (key === undefined) return Promise.resolve(undefined);
    return this.database.write(async (session) => {
      const current = await this.load(session, id);
      if (current === undefined) return undefined;
      const next = change(structuredClone(current));
      await this.store(session, next);
      return next;
    });
  }

  remove(id: string): Promise<boolean> {
    const key = keyLiteral(id);
    if (key === undefined) return Promise.resolve(false);
    return this.database.write(async (session) => {
      if (!(await this.exists(session, key))) return false;
      await this.hooks.run('work', id, session);
      await session.execute(`match $e isa edition, has edition-work ${key}; delete $e;`);
      await session.execute(`match $d isa work-details, has work-details-key ${key}; delete $d;`);
      await session.execute(`match $w isa work, has work-id ${key}; delete $w;`);
      return true;
    });
  }

  private async exists(session: Session, key: string): Promise<boolean> {
    return (await session.query(`match $w isa work, has work-id ${key}; select $w;`)).length > 0;
  }

  private async load(session: Session, id: string): Promise<Work | undefined> {
    const key = keyLiteral(id);
    if (key === undefined) return undefined;
    const details = await session.query(
      `match $w isa work, has work-id ${key}; (owner: $w, details: $d) isa work-details-of; $d isa work-details, ${DETAILS_SELECT}; select $t, $st, $sy, $s, $c, $u;`,
    );
    const row = details[0];
    if (row === undefined) return undefined;
    const editions = await session.query(
      `match $w isa work, has work-id ${key}; (owner: $w, edition: $e) isa work-edition; $e isa edition, ${EDITION_SELECT}; select $n, $label, $status, $published, $notes, $created, $updated;`,
    );
    return workFrom(id, row, editions.map(editionFrom));
  }

  /** Inserts the work's identity if it is new, then replaces its details and editions. */
  private async store(session: Session, work: Work): Promise<void> {
    const key = keyOrThrow(work.id);
    if (!(await this.exists(session, key))) {
      const orders = await session.query('match $w isa work, has work-order $o; select $o;');
      const next = orders.reduce((highest, row) => Math.max(highest, Number(row['o'])), 0) + 1;
      await session.execute(`insert $w isa work, has work-id ${key}, has work-order ${next};`);
    }
    await session.execute(`match $e isa edition, has edition-work ${key}; delete $e;`);
    await session.execute(`match $d isa work-details, has work-details-key ${key}; delete $d;`);
    await session.execute(
      `insert $d isa work-details, has work-details-key ${key}, has work-title ${encode(work.title)}, ` +
        `has work-subtitle ${encode(work.subtitle ?? '')}, has work-synopsis ${encode(work.synopsis ?? '')}, ` +
        `has work-status ${encode(work.status)}, has work-created-at ${encode(work.createdAt)}, ` +
        `has work-updated-at ${encode(work.updatedAt)};`,
    );
    await session.execute(
      `match $w isa work, has work-id ${key}; $d isa work-details, has work-details-key ${key}; insert (owner: $w, details: $d) isa work-details-of;`,
    );
    for (const edition of work.editions) {
      const editionKey = keyOrThrow(`${work.id}::${edition.number}`);
      await session.execute(
        `insert $e isa edition, has edition-key ${editionKey}, has edition-work ${key}, has edition-number ${edition.number}, ` +
          `has edition-label ${encode(edition.label)}, has edition-status ${encode(edition.status)}, ` +
          `has edition-published-on ${encode(edition.publishedOn ?? '')}, has edition-notes ${encode(edition.notes ?? '')}, ` +
          `has edition-created-at ${encode(edition.createdAt)}, has edition-updated-at ${encode(edition.updatedAt)};`,
      );
      await session.execute(
        `match $w isa work, has work-id ${key}; $e isa edition, has edition-key ${editionKey}; insert (owner: $w, edition: $e) isa work-edition;`,
      );
    }
  }
}

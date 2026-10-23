import {
  addNode,
  emptyManuscript,
  findNode,
  getNode,
  moveNode,
  outlineOf,
  parseWorkId,
  removeNode,
  updateNode,
  type Manuscript,
  type ManuscriptNode,
  type Outline,
} from '@indie-writer-studio/manuscript-domain';
import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';

import { applyRule } from './errors.js';
import {
  MANUSCRIPT_CLOCK,
  MANUSCRIPT_ID_GENERATOR,
  MANUSCRIPT_REPOSITORY,
  type Clock,
  type IdGenerator,
  type ManuscriptRepository,
} from './ports.js';
import {
  AddNodeCommand,
  GetNodeQuery,
  GetOutlineQuery,
  MoveNodeCommand,
  RemoveNodeCommand,
  UpdateNodeCommand,
} from './requests.js';

/** The manuscript to change: the stored one, or a new empty one for a work that has none yet. */
const current = (manuscript: Manuscript | undefined, workId: string, now: string): Manuscript =>
  manuscript ?? emptyManuscript(workId, now);

const nodeOf = (manuscript: Manuscript, id: string): ManuscriptNode =>
  findNode(manuscript, id) as ManuscriptNode;

@CommandHandler(AddNodeCommand)
export class AddNodeHandler implements ICommandHandler<AddNodeCommand, { node: ManuscriptNode }> {
  constructor(
    @Inject(MANUSCRIPT_REPOSITORY) private readonly repository: ManuscriptRepository,
    @Inject(MANUSCRIPT_ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(MANUSCRIPT_CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: AddNodeCommand): Promise<{ node: ManuscriptNode }> {
    applyRule(() => parseWorkId(command.workId));
    const id = this.ids.next();
    const now = this.clock.now();
    const manuscript = await this.repository.update(command.workId, (stored) =>
      applyRule(() =>
        addNode(
          current(stored, command.workId, now),
          {
            id,
            kind: command.kind,
            title: command.title,
            body: command.body,
            parentId: command.parentId,
            matter: command.matter,
            position: command.position,
          },
          now,
        ),
      ),
    );
    return { node: nodeOf(manuscript, id) };
  }
}

@QueryHandler(GetNodeQuery)
export class GetNodeHandler implements IQueryHandler<GetNodeQuery, { node: ManuscriptNode }> {
  constructor(@Inject(MANUSCRIPT_REPOSITORY) private readonly repository: ManuscriptRepository) {}

  async execute(query: GetNodeQuery): Promise<{ node: ManuscriptNode }> {
    applyRule(() => parseWorkId(query.workId));
    const manuscript = await this.repository.get(query.workId);
    return {
      node: applyRule(() => getNode(manuscript ?? emptyManuscript(query.workId, ''), query.id)),
    };
  }
}

@QueryHandler(GetOutlineQuery)
export class GetOutlineHandler implements IQueryHandler<GetOutlineQuery, Outline> {
  constructor(@Inject(MANUSCRIPT_REPOSITORY) private readonly repository: ManuscriptRepository) {}

  async execute(query: GetOutlineQuery): Promise<Outline> {
    applyRule(() => parseWorkId(query.workId));
    const manuscript = await this.repository.get(query.workId);
    return outlineOf(manuscript ?? emptyManuscript(query.workId, ''));
  }
}

@CommandHandler(UpdateNodeCommand)
export class UpdateNodeHandler implements ICommandHandler<
  UpdateNodeCommand,
  { node: ManuscriptNode }
> {
  constructor(
    @Inject(MANUSCRIPT_REPOSITORY) private readonly repository: ManuscriptRepository,
    @Inject(MANUSCRIPT_CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateNodeCommand): Promise<{ node: ManuscriptNode }> {
    applyRule(() => parseWorkId(command.workId));
    const now = this.clock.now();
    const manuscript = await this.repository.update(command.workId, (stored) =>
      applyRule(() =>
        updateNode(current(stored, command.workId, now), command.id, command.patch, now),
      ),
    );
    return { node: nodeOf(manuscript, command.id) };
  }
}

@CommandHandler(MoveNodeCommand)
export class MoveNodeHandler implements ICommandHandler<MoveNodeCommand, { node: ManuscriptNode }> {
  constructor(
    @Inject(MANUSCRIPT_REPOSITORY) private readonly repository: ManuscriptRepository,
    @Inject(MANUSCRIPT_CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: MoveNodeCommand): Promise<{ node: ManuscriptNode }> {
    applyRule(() => parseWorkId(command.workId));
    const now = this.clock.now();
    const manuscript = await this.repository.update(command.workId, (stored) =>
      applyRule(() =>
        moveNode(current(stored, command.workId, now), command.id, command.destination, now),
      ),
    );
    return { node: nodeOf(manuscript, command.id) };
  }
}

@CommandHandler(RemoveNodeCommand)
export class RemoveNodeHandler implements ICommandHandler<RemoveNodeCommand, { removed: string }> {
  constructor(
    @Inject(MANUSCRIPT_REPOSITORY) private readonly repository: ManuscriptRepository,
    @Inject(MANUSCRIPT_CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: RemoveNodeCommand): Promise<{ removed: string }> {
    applyRule(() => parseWorkId(command.workId));
    const now = this.clock.now();
    await this.repository.update(command.workId, (stored) =>
      applyRule(() => removeNode(current(stored, command.workId, now), command.id, now)),
    );
    return { removed: command.id };
  }
}

export const MANUSCRIPT_HANDLERS = [
  AddNodeHandler,
  GetNodeHandler,
  GetOutlineHandler,
  UpdateNodeHandler,
  MoveNodeHandler,
  RemoveNodeHandler,
];

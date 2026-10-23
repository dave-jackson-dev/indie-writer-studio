import {
  addNode,
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

import { applyRule, ManuscriptWorkNotFoundError } from './errors.js';
import {
  MANUSCRIPT_ID_GENERATOR,
  MANUSCRIPT_REPOSITORY,
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

@CommandHandler(AddNodeCommand)
export class AddNodeHandler implements ICommandHandler<AddNodeCommand, { node: ManuscriptNode }> {
  constructor(
    @Inject(MANUSCRIPT_REPOSITORY) private readonly repository: ManuscriptRepository,
    @Inject(MANUSCRIPT_ID_GENERATOR) private readonly ids: IdGenerator,
  ) {}

  async execute(command: AddNodeCommand): Promise<{ node: ManuscriptNode }> {
    applyRule(() => parseWorkId(command.workId));
    const id = this.ids.next();
    const manuscript = await this.repository.update(command.workId, (current) =>
      applyRule(() =>
        addNode(current, {
          id,
          kind: command.kind,
          title: command.title,
          body: command.body,
          parentId: command.parentId,
          matter: command.matter,
          position: command.position,
        }),
      ),
    );
    return { node: applyRule(() => getNode(manuscript, id)) };
  }
}

/** The manuscript of an existing Work, or the refusals for a bad or unknown Work. */
async function manuscriptOf(repository: ManuscriptRepository, workId: string): Promise<Manuscript> {
  applyRule(() => parseWorkId(workId));
  const manuscript = await repository.get(workId);
  if (manuscript === undefined) throw new ManuscriptWorkNotFoundError(workId);
  return manuscript;
}

@QueryHandler(GetNodeQuery)
export class GetNodeHandler implements IQueryHandler<GetNodeQuery, { node: ManuscriptNode }> {
  constructor(@Inject(MANUSCRIPT_REPOSITORY) private readonly repository: ManuscriptRepository) {}

  async execute(query: GetNodeQuery): Promise<{ node: ManuscriptNode }> {
    const manuscript = await manuscriptOf(this.repository, query.workId);
    return { node: applyRule(() => getNode(manuscript, query.id)) };
  }
}

@QueryHandler(GetOutlineQuery)
export class GetOutlineHandler implements IQueryHandler<GetOutlineQuery, Outline> {
  constructor(@Inject(MANUSCRIPT_REPOSITORY) private readonly repository: ManuscriptRepository) {}

  async execute(query: GetOutlineQuery): Promise<Outline> {
    return outlineOf(await manuscriptOf(this.repository, query.workId));
  }
}

@CommandHandler(UpdateNodeCommand)
export class UpdateNodeHandler implements ICommandHandler<
  UpdateNodeCommand,
  { node: ManuscriptNode }
> {
  constructor(@Inject(MANUSCRIPT_REPOSITORY) private readonly repository: ManuscriptRepository) {}

  async execute(command: UpdateNodeCommand): Promise<{ node: ManuscriptNode }> {
    applyRule(() => parseWorkId(command.workId));
    const manuscript = await this.repository.update(command.workId, (current) =>
      applyRule(() => updateNode(current, command.id, command.patch)),
    );
    return { node: applyRule(() => getNode(manuscript, command.id)) };
  }
}

@CommandHandler(MoveNodeCommand)
export class MoveNodeHandler implements ICommandHandler<MoveNodeCommand, { node: ManuscriptNode }> {
  constructor(@Inject(MANUSCRIPT_REPOSITORY) private readonly repository: ManuscriptRepository) {}

  async execute(command: MoveNodeCommand): Promise<{ node: ManuscriptNode }> {
    applyRule(() => parseWorkId(command.workId));
    const manuscript = await this.repository.update(command.workId, (current) =>
      applyRule(() => moveNode(current, command.id, command.destination)),
    );
    return { node: applyRule(() => getNode(manuscript, command.id)) };
  }
}

@CommandHandler(RemoveNodeCommand)
export class RemoveNodeHandler implements ICommandHandler<RemoveNodeCommand, { removed: string }> {
  constructor(@Inject(MANUSCRIPT_REPOSITORY) private readonly repository: ManuscriptRepository) {}

  async execute(command: RemoveNodeCommand): Promise<{ removed: string }> {
    applyRule(() => parseWorkId(command.workId));
    await this.repository.update(command.workId, (current) =>
      applyRule(() => removeNode(current, command.id)),
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

import {
  addEdition,
  createWork,
  publishEdition,
  updateWork,
  WORK_STATUSES,
  type Edition,
  type Work,
  type WorkStatus,
} from '@indie-writer-studio/works-domain';
import { Inject } from '@nestjs/common';
import {
  CommandHandler,
  QueryHandler,
  type ICommandHandler,
  type IQueryHandler,
} from '@nestjs/cqrs';

import { applyRule, WorkNotFoundError, WorksError } from './errors.js';
import {
  CLOCK,
  ID_GENERATOR,
  WORK_REPOSITORY,
  type Clock,
  type IdGenerator,
  type WorkRepository,
} from './ports.js';
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

async function load(repository: WorkRepository, id: string): Promise<Work> {
  const work = await repository.get(id);
  if (!work) throw new WorkNotFoundError(id);
  return work;
}

const editionOf = (work: Work, number: number): Edition => {
  const edition = work.editions.find((candidate) => candidate.number === number);
  if (!edition) throw new Error(`edition ${number} vanished from ${work.id}`);
  return edition;
};

@CommandHandler(AddWorkCommand)
export class AddWorkHandler implements ICommandHandler<AddWorkCommand, { work: Work }> {
  constructor(
    @Inject(WORK_REPOSITORY) private readonly repository: WorkRepository,
    @Inject(ID_GENERATOR) private readonly ids: IdGenerator,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: AddWorkCommand): Promise<{ work: Work }> {
    const work = applyRule(() =>
      createWork(
        this.ids.next(),
        { title: command.title, subtitle: command.subtitle, synopsis: command.synopsis },
        this.clock.now(),
      ),
    );
    await this.repository.save(work);
    return { work };
  }
}

@QueryHandler(GetWorkQuery)
export class GetWorkHandler implements IQueryHandler<GetWorkQuery, { work: Work }> {
  constructor(@Inject(WORK_REPOSITORY) private readonly repository: WorkRepository) {}

  async execute(query: GetWorkQuery): Promise<{ work: Work }> {
    return { work: await load(this.repository, query.id) };
  }
}

@QueryHandler(ListWorksQuery)
export class ListWorksHandler implements IQueryHandler<ListWorksQuery, { works: readonly Work[] }> {
  constructor(@Inject(WORK_REPOSITORY) private readonly repository: WorkRepository) {}

  async execute(query: ListWorksQuery): Promise<{ works: readonly Work[] }> {
    const { status } = query;
    if (status !== undefined && !WORK_STATUSES.includes(status as WorkStatus)) {
      throw new WorksError(
        'INVALID_WORK',
        `'${status}' is not a status; use one of ${WORK_STATUSES.join(', ')}.`,
        2,
      );
    }
    const works = await this.repository.list();
    return { works: status === undefined ? works : works.filter((work) => work.status === status) };
  }
}

@CommandHandler(UpdateWorkCommand)
export class UpdateWorkHandler implements ICommandHandler<UpdateWorkCommand, { work: Work }> {
  constructor(
    @Inject(WORK_REPOSITORY) private readonly repository: WorkRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: UpdateWorkCommand): Promise<{ work: Work }> {
    const current = await load(this.repository, command.id);
    const work = applyRule(() => updateWork(current, command.patch, this.clock.now()));
    await this.repository.save(work);
    return { work };
  }
}

@CommandHandler(RemoveWorkCommand)
export class RemoveWorkHandler implements ICommandHandler<RemoveWorkCommand, { removed: string }> {
  constructor(@Inject(WORK_REPOSITORY) private readonly repository: WorkRepository) {}

  async execute(command: RemoveWorkCommand): Promise<{ removed: string }> {
    if (!(await this.repository.remove(command.id))) throw new WorkNotFoundError(command.id);
    return { removed: command.id };
  }
}

@CommandHandler(AddEditionCommand)
export class AddEditionHandler implements ICommandHandler<
  AddEditionCommand,
  { work: Work; edition: Edition }
> {
  constructor(
    @Inject(WORK_REPOSITORY) private readonly repository: WorkRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: AddEditionCommand): Promise<{ work: Work; edition: Edition }> {
    const current = await load(this.repository, command.workId);
    const work = applyRule(() =>
      addEdition(current, { label: command.label, notes: command.notes }, this.clock.now()),
    );
    await this.repository.save(work);
    return { work, edition: work.editions[work.editions.length - 1] as Edition };
  }
}

@CommandHandler(PublishEditionCommand)
export class PublishEditionHandler implements ICommandHandler<
  PublishEditionCommand,
  { work: Work; edition: Edition }
> {
  constructor(
    @Inject(WORK_REPOSITORY) private readonly repository: WorkRepository,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async execute(command: PublishEditionCommand): Promise<{ work: Work; edition: Edition }> {
    const current = await load(this.repository, command.workId);
    const work = applyRule(() =>
      publishEdition(current, command.number, command.publishedOn, this.clock.now()),
    );
    await this.repository.save(work);
    return { work, edition: editionOf(work, command.number) };
  }
}

@QueryHandler(ListEditionsQuery)
export class ListEditionsHandler implements IQueryHandler<
  ListEditionsQuery,
  { editions: readonly Edition[] }
> {
  constructor(@Inject(WORK_REPOSITORY) private readonly repository: WorkRepository) {}

  async execute(query: ListEditionsQuery): Promise<{ editions: readonly Edition[] }> {
    const work = await load(this.repository, query.workId);
    return { editions: [...work.editions].sort((a, b) => a.number - b.number) };
  }
}

export const WORKS_HANDLERS = [
  AddWorkHandler,
  GetWorkHandler,
  ListWorksHandler,
  UpdateWorkHandler,
  RemoveWorkHandler,
  AddEditionHandler,
  PublishEditionHandler,
  ListEditionsHandler,
];

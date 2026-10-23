import type { WorkPatch } from '@indie-writer-studio/works-domain';

export class AddWorkCommand {
  constructor(
    public readonly title: string,
    public readonly subtitle: string | undefined,
    public readonly synopsis: string | undefined,
  ) {}
}
export class GetWorkQuery {
  constructor(public readonly id: string) {}
}
export class ListWorksQuery {
  constructor(public readonly status: string | undefined) {}
}
export class UpdateWorkCommand {
  constructor(
    public readonly id: string,
    public readonly patch: WorkPatch,
  ) {}
}
export class RemoveWorkCommand {
  constructor(public readonly id: string) {}
}
export class AddEditionCommand {
  constructor(
    public readonly workId: string,
    public readonly label: string | undefined,
    public readonly notes: string | undefined,
  ) {}
}
export class PublishEditionCommand {
  constructor(
    public readonly workId: string,
    public readonly number: number,
    public readonly publishedOn: string | undefined,
  ) {}
}
export class ListEditionsQuery {
  constructor(public readonly workId: string) {}
}

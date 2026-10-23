import type { Destination, NodePatch } from '@indie-writer-studio/manuscript-domain';

export class AddNodeCommand {
  constructor(
    public readonly workId: string,
    public readonly kind: string,
    public readonly title: string,
    public readonly body: string | undefined,
    public readonly parentId: string | undefined,
    public readonly matter: string | undefined,
    public readonly position: number | undefined,
  ) {}
}
export class GetNodeQuery {
  constructor(
    public readonly workId: string,
    public readonly id: string,
  ) {}
}
export class GetOutlineQuery {
  constructor(public readonly workId: string) {}
}
export class UpdateNodeCommand {
  constructor(
    public readonly workId: string,
    public readonly id: string,
    public readonly patch: NodePatch,
  ) {}
}
export class MoveNodeCommand {
  constructor(
    public readonly workId: string,
    public readonly id: string,
    public readonly destination: Destination,
  ) {}
}
export class RemoveNodeCommand {
  constructor(
    public readonly workId: string,
    public readonly id: string,
  ) {}
}

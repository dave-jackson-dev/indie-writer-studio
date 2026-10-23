import {
  defineOperation,
  type ToolOperationDescriptor,
} from '@indie-writer-studio/cqrs-tool-runtime';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';

export const SERVICE_NAME = 'indie-writer';
export const SERVICE_VERSION = '0.0.1';

export class GetHealthQuery {
  constructor(public readonly components: readonly string[]) {}
}

export interface Health {
  readonly status: 'ok';
  readonly service: string;
  readonly version: string;
  /** The components this process composed, so a probe can tell a bare root from a full one. */
  readonly components: readonly string[];
}

@QueryHandler(GetHealthQuery)
export class GetHealthHandler implements IQueryHandler<GetHealthQuery, Health> {
  async execute(query: GetHealthQuery): Promise<Health> {
    return {
      status: 'ok',
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      components: query.components,
    };
  }
}

/** The root's own operations: the ones that belong to no component. */
export const createSystemOperations = (
  componentNames: readonly string[],
): readonly ToolOperationDescriptor[] => [
  defineOperation({
    name: 'system.health',
    summary: 'Is the service up, and which components did it compose?',
    kind: 'query',
    createRequest: () => new GetHealthQuery(componentNames),
    validate: () => ({}),
  }),
];

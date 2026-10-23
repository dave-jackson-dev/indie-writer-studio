import { TOOL_EXIT_CODES } from '@indie-writer-studio/cqrs-tool-runtime';
import { WorksDomainError, type WorksDomainErrorCode } from '@indie-writer-studio/works-domain';

/** A failure with a stable `code` and `exitCode`, which the runtime carries into the envelope. */
export class WorksError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly exitCode: number,
  ) {
    super(message);
    this.name = 'WorksError';
  }
}

export class WorkNotFoundError extends WorksError {
  constructor(id: string) {
    super('WORK_NOT_FOUND', `There is no work with id '${id}'.`, TOOL_EXIT_CODES.notFound);
  }
}

const EXIT_CODES: Record<WorksDomainErrorCode, number> = {
  INVALID_WORK: TOOL_EXIT_CODES.usage,
  INVALID_EDITION: TOOL_EXIT_CODES.usage,
  EDITION_NOT_FOUND: TOOL_EXIT_CODES.notFound,
  EDITION_CONFLICT: TOOL_EXIT_CODES.conflict,
};

/** Runs a domain rule, reporting a refusal as a coded error instead of a bare exception. */
export function applyRule<T>(rule: () => T): T {
  try {
    return rule();
  } catch (error) {
    if (error instanceof WorksDomainError) {
      throw new WorksError(error.code, error.message, EXIT_CODES[error.code]);
    }
    throw error;
  }
}

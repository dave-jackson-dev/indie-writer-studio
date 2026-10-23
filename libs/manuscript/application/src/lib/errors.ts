import { TOOL_EXIT_CODES } from '@indie-writer-studio/cqrs-tool-runtime';
import {
  ManuscriptDomainError,
  type ManuscriptErrorCode,
} from '@indie-writer-studio/manuscript-domain';

/** A failure with a stable `code` and `exitCode`, which the runtime carries into the envelope. */
export class ManuscriptError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly exitCode: number,
  ) {
    super(message);
    this.name = 'ManuscriptError';
  }
}

/** The Work a manuscript belongs to does not exist. */
export class ManuscriptWorkNotFoundError extends ManuscriptError {
  constructor(workId: string) {
    super('WORK_NOT_FOUND', `There is no work with id '${workId}'.`, TOOL_EXIT_CODES.notFound);
  }
}

const EXIT_CODES: Record<ManuscriptErrorCode, number> = {
  INVALID_NODE: TOOL_EXIT_CODES.usage,
  INVALID_PLACEMENT: TOOL_EXIT_CODES.usage,
  INVALID_WORK_ID: TOOL_EXIT_CODES.usage,
  NODE_NOT_FOUND: TOOL_EXIT_CODES.notFound,
};

/** Runs a domain rule, reporting a refusal as a coded error instead of a bare exception. */
export function applyRule<T>(rule: () => T): T {
  try {
    return rule();
  } catch (error) {
    if (error instanceof ManuscriptDomainError) {
      throw new ManuscriptError(error.code, error.message, EXIT_CODES[error.code]);
    }
    throw error;
  }
}

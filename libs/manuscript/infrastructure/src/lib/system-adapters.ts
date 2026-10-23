import { randomUUID } from 'node:crypto';

import type { IdGenerator } from '@indie-writer-studio/manuscript-application';

export class UuidGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}

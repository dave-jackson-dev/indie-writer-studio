import { Injectable, signal } from '@angular/core';

import { OperationError } from '../bridge/operations';

/** What the author is told when something did not work. The toast in the app shell shows the latest. */
@Injectable({ providedIn: 'root' })
export class Notices {
  readonly latest = signal<{ id: number; text: string } | undefined>(undefined);
  private count = 0;

  tell(text: string): void {
    this.latest.set({ id: ++this.count, text });
  }

  failure(error: unknown): void {
    this.tell(
      error instanceof OperationError
        ? error.message
        : `Something went wrong: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

import type { Session } from './database.js';

export type CascadeHook = (id: string, session: Session) => Promise<void>;

/**
 * What must go when its owner goes. The engine does not cascade: deleting a Work leaves the nodes
 * that belonged to it. A component that owns things belonging to another registers a hook under the
 * owner's name, and the owner's repository runs the hooks inside its own removal transaction, so a
 * hook that refuses leaves everything as it was. Neither component imports the other.
 */
export class CascadeHooks {
  private readonly hooks = new Map<string, CascadeHook[]>();

  register(owner: string, hook: CascadeHook): void {
    this.hooks.set(owner, [...(this.hooks.get(owner) ?? []), hook]);
  }

  async run(owner: string, id: string, session: Session): Promise<void> {
    for (const hook of this.hooks.get(owner) ?? []) await hook(id, session);
  }
}

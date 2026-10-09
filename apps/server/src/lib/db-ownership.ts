import { AsyncLocalStorage } from "node:async_hooks";

// Requests can outlive a forced socket close. Keep their ownership in async
// context so they cannot reopen SQLite, including after another server starts.
const context = new AsyncLocalStorage<symbol>();
let activeOwner: symbol | null | undefined;

export function acquireServerDatabase() {
  const owner = Symbol("server database owner");
  activeOwner = owner;
  return {
    run<T>(work: () => T): T {
      return context.run(owner, work);
    },
    revoke(): void {
      if (activeOwner === owner) activeOwner = null;
    },
  };
}

export function assertDatabaseOwner(): void {
  const caller = context.getStore();
  if (activeOwner === null || (caller && caller !== activeOwner)) {
    throw new Error("Server database owner has stopped");
  }
}

/** Teardown may run after revocation, but a stale caller cannot stop a successor. */
export function assertServerCaller(): void {
  const caller = context.getStore();
  if (caller && activeOwner && caller !== activeOwner) {
    throw new Error("Server database owner has stopped");
  }
}

export function isDatabaseOwner(): boolean {
  const caller = context.getStore();
  return activeOwner !== null && (!caller || caller === activeOwner);
}

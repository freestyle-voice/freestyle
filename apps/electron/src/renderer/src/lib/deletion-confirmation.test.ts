import { afterEach, describe, expect, it, vi } from "vitest";
import {
  setDeletionConfirmationSkipped,
  shouldSkipDeletionConfirmation,
} from "./deletion-confirmation";

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("deletion confirmation preferences", () => {
  it("keeps schedule and session confirmation choices independent", () => {
    vi.stubGlobal("localStorage", createStorage());

    setDeletionConfirmationSkipped("schedule", true);

    expect(shouldSkipDeletionConfirmation("schedule")).toBe(true);
    expect(shouldSkipDeletionConfirmation("session")).toBe(false);
  });

  it("restores confirmation when the user re-enables it", () => {
    vi.stubGlobal("localStorage", createStorage());
    setDeletionConfirmationSkipped("session", true);

    setDeletionConfirmationSkipped("session", false);

    expect(shouldSkipDeletionConfirmation("session")).toBe(false);
  });
});

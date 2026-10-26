import { describe, expect, it } from "vitest";
import {
  createSettingSaveQueue,
  type SettingSaveStates,
} from "./setting-save-queue";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  void promise.catch(() => {});
  return { promise, resolve, reject };
}

describe("Tone setting persistence", () => {
  it("exposes pending writes to remounted controls until queued writes settle", async () => {
    const oldPage = createSettingSaveQueue(() => {});
    const newPage = createSettingSaveQueue(() => {});
    const request = deferred();
    const first = oldPage.save("network_remount", () => request.promise);
    const second = newPage.save("network_remount", async () => {});
    const pendingBeforeCompletion = newPage.isPending?.("network_remount");
    request.resolve();
    await Promise.all([first, second]);
    expect(pendingBeforeCompletion).toBe(true);
    expect(newPage.isPending("network_remount")).toBe(false);
  });

  it("serializes rapid choices so the newest value is the last persisted value", async () => {
    let state: SettingSaveStates = {};
    const queue = createSettingSaveQueue((next) => {
      state = next;
    });
    const firstRequest = deferred();
    const persisted: string[] = [];
    const first = queue.save("tone", async () => {
      await firstRequest.promise;
      persisted.push("casual");
    });
    const second = queue.save("tone", async () => {
      persisted.push("formal");
    });
    await Promise.resolve();
    expect(state.tone?.phase).toBe("saving");
    expect(persisted).toEqual([]);
    firstRequest.resolve();
    await Promise.all([first, second]);
    expect(persisted).toEqual(["casual", "formal"]);
    expect(state.tone?.phase).toBe("saved");
  });

  it("preserves newer choices when navigation creates another queue during a slow save", async () => {
    const oldPage = createSettingSaveQueue(() => {});
    let newPageState: SettingSaveStates = {};
    const newPage = createSettingSaveQueue((next) => {
      newPageState = next;
    });
    const oldRequest = deferred();
    const persisted: string[] = [];
    const oldSave = oldPage.save("personal_tone", async () => {
      await oldRequest.promise;
      persisted.push("casual");
    });
    const newSave = newPage.save("personal_tone", async () => {
      persisted.push("formal");
    });
    await Promise.resolve();
    const beforeOldSaveFinishes = [...persisted];
    const phaseBeforeOldSaveFinishes = newPageState.personal_tone?.phase;
    oldRequest.resolve();
    await Promise.all([oldSave, newSave]);
    expect(beforeOldSaveFinishes).toEqual([]);
    expect(phaseBeforeOldSaveFinishes).toBe("saving");
    expect(persisted).toEqual(["casual", "formal"]);
    expect(newPageState.personal_tone?.phase).toBe("saved");
  });

  it("keeps a rejected choice unsaved and retries its actual write", async () => {
    let state: SettingSaveStates = {};
    const queue = createSettingSaveQueue((next) => {
      state = next;
    });
    const persisted: string[] = [];
    let unavailable = true;
    await queue.save("prompt", async () => {
      if (unavailable) throw new Error("Service unavailable");
      persisted.push("My custom prompt");
    });
    expect(state.prompt?.phase).toBe("error");
    expect(queue.isPending("prompt")).toBe(false);
    expect(persisted).toEqual([]);
    unavailable = false;
    await state.prompt.retry?.();
    expect(state.prompt?.phase).toBe("saved");
    expect(persisted).toEqual(["My custom prompt"]);
  });

  it("does not let an older failure replace the state or retry of a newer choice", async () => {
    let state: SettingSaveStates = {};
    const queue = createSettingSaveQueue((next) => {
      state = next;
    });
    const request = deferred();
    const first = queue.save("assignments", () => request.promise);
    const second = queue.save("assignments", async () => {});
    request.reject(new Error("Old choice failed"));
    await Promise.all([first, second]);
    expect(state.assignments?.phase).toBe("saved");
    expect(state.assignments.retry).toBeUndefined();
  });

  it("retains an error in one control while another control saves successfully", async () => {
    let state: SettingSaveStates = {};
    const queue = createSettingSaveQueue((next) => {
      state = next;
    });
    await queue.save("cloud", async () => {
      throw new Error("Cloud unavailable");
    });
    await queue.save("strength", async () => {});
    expect(state.cloud?.phase).toBe("error");
    expect(state.strength?.phase).toBe("saved");
  });
});

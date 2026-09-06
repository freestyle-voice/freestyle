import { describe, expect, it } from "vitest";
import { createPetEnabledStateSync } from "./pet-enabled";

describe("pet-enabled state synchronization", () => {
  it("keeps a newer companion-close event over a stale initial read", () => {
    const values: boolean[] = [];
    const sync = createPetEnabledStateSync((enabled) => values.push(enabled));

    sync.onChanged(false);
    sync.onInitial(true);

    expect(values).toEqual([false]);
  });

  it("uses the initial value until a live companion update arrives", () => {
    const values: boolean[] = [];
    const sync = createPetEnabledStateSync((enabled) => values.push(enabled));

    sync.onInitial(true);
    sync.onChanged(false);

    expect(values).toEqual([true, false]);
  });
});

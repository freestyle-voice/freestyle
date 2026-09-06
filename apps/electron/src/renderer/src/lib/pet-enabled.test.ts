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

  it("ignores a cleaned-up Settings page's pending initial read", () => {
    const values: boolean[] = [];
    const stale = createPetEnabledStateSync((enabled) => values.push(enabled));
    const current = createPetEnabledStateSync((enabled) =>
      values.push(enabled),
    );

    stale.dispose();
    current.onChanged(false);
    stale.onInitial(true);

    expect(values).toEqual([false]);
  });
});

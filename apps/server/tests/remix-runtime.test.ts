import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../src/lib/db.js";
import { getRemixRuntime } from "../src/lib/remix-runtime.js";

beforeEach(() => {
  getDb().prepare("DELETE FROM model_configs WHERE type = 'remix'").run();
});

describe("getRemixRuntime", () => {
  it("uses managed Cloud when no Remix model is configured", () => {
    expect(getRemixRuntime()).toEqual({ kind: "managed" });
  });

  it("uses managed Cloud when Freestyle Cloud is selected", () => {
    getDb()
      .prepare(
        `INSERT INTO model_configs
          (provider, model_id, model_name, type, is_default)
         VALUES ('freestyle-cloud', 'freestyle-cloud/remix', 'Freestyle Cloud', 'remix', 1)`,
      )
      .run();

    expect(getRemixRuntime()).toEqual({ kind: "managed" });
  });

  it("selects a local runtime only for an explicitly configured non-Cloud model", () => {
    getDb()
      .prepare(
        `INSERT INTO model_configs
          (provider, model_id, model_name, type, is_default)
         VALUES ('local-llm', 'local-llm/qwen', 'Qwen', 'remix', 1)`,
      )
      .run();

    expect(getRemixRuntime()).toEqual({
      kind: "local",
      model: {
        provider: "local-llm",
        model_id: "local-llm/qwen",
        model_name: "Qwen",
      },
    });
  });
});

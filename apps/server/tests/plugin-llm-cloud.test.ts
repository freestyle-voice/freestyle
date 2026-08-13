import { afterEach, describe, expect, it } from "vitest";
import { FREESTYLE_CLOUD_PROVIDER_ID } from "../src/lib/freestyle-cloud.js";
import { applyFreestyleCloudDefaults } from "../src/lib/freestyle-cloud-defaults.js";
import { buildPluginLlm } from "../src/lib/plugins/llm.js";
import { createChatModel } from "../src/lib/providers.js";
import { clearSession, setSession } from "../src/lib/sessions.js";

function signIn(): void {
  setSession({
    token: "cloud-session-token",
    user: { id: "user_1", email: "user@example.com" },
    host: "https://service.freestylevoice.com",
  });
}

describe("Freestyle Cloud LLM provider", () => {
  afterEach(() => {
    clearSession();
  });

  it("rejects any provider other than Freestyle Cloud", async () => {
    signIn();
    await expect(createChatModel("openai", "openai/gpt-4o")).rejects.toThrow(
      /unsupported provider/i,
    );
  });

  it("resolves an AI SDK model when signed in (no throw)", async () => {
    signIn();
    const model = await createChatModel(
      FREESTYLE_CLOUD_PROVIDER_ID,
      "freestyle-cloud/post-process",
    );
    expect(model).toBeDefined();
  });

  it("throws when signed out (no session token)", async () => {
    clearSession();
    await expect(
      createChatModel(
        FREESTYLE_CLOUD_PROVIDER_ID,
        "freestyle-cloud/post-process",
      ),
    ).rejects.toThrow(/sign in/i);
  });

  it("exposes api.llm for a signed-in Freestyle Cloud user", async () => {
    applyFreestyleCloudDefaults();
    signIn();

    const llm = await buildPluginLlm();
    expect(llm).toBeDefined();
    expect(llm?.providerId).toBe(FREESTYLE_CLOUD_PROVIDER_ID);
    expect(llm?.getModel()).toBeDefined();
  });

  it("returns no LLM capability when the cloud user is signed out", async () => {
    applyFreestyleCloudDefaults();
    clearSession();

    const llm = await buildPluginLlm();
    expect(llm).toBeUndefined();
  });
});

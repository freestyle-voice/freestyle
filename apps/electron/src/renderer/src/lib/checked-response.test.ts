import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { checkedJson, checkedResponse } from "./checked-response";

describe("checked API responses", () => {
  it.each([
    401, 500, 504,
  ])("rejects HTTP %s before parsing an error body as data", async (status) => {
    const json = vi.fn().mockResolvedValue({ error: "server failure" });
    await expect(
      checkedJson(
        Promise.resolve({ ok: false, status, json }),
        "Could not load dictionary",
      ),
    ).rejects.toThrow(`Could not load dictionary (HTTP ${status})`);
    expect(json).not.toHaveBeenCalled();
  });

  it("keeps successful typed responses available to callers, including empty-body deletes", async () => {
    const response = new Response(null, { status: 204 });
    await expect(
      checkedResponse(Promise.resolve(response), "Could not delete entry"),
    ).resolves.toBe(response);
  });

  it("rejects malformed successful JSON instead of replacing it with empty data", async () => {
    await expect(
      checkedJson(
        Promise.resolve(new Response("invalid JSON")),
        "Could not load history",
      ),
    ).rejects.toBeInstanceOf(SyntaxError);
  });

  it.each([
    "dictionary",
    "vocabulary",
    "history",
  ])("retains cached %s entries after a failed refresh", async (feature) => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const queryKey = [feature, "list"];
    const cached = { items: [{ id: 1 }], total: 1 };
    client.setQueryData(queryKey, cached);
    await expect(
      client.fetchQuery({
        queryKey,
        queryFn: () =>
          checkedJson(
            Promise.resolve(new Response("failure", { status: 500 })),
            `Could not load ${feature}`,
          ),
      }),
    ).rejects.toThrow("HTTP 500");
    expect(client.getQueryData(queryKey)).toEqual(cached);
    expect(client.getQueryState(queryKey)?.status).toBe("error");
    client.clear();
  });

  it("does not run deletion success effects for an HTTP failure", async () => {
    const invalidate = vi.fn();
    await expect(
      checkedResponse(
        Promise.resolve(new Response(null, { status: 500 })),
        "Could not delete entry",
      ).then(invalidate),
    ).rejects.toThrow("Could not delete entry (HTTP 500)");
    expect(invalidate).not.toHaveBeenCalled();
  });
});

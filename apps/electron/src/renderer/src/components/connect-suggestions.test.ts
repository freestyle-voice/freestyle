import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@renderer/components/connected-apps", () => ({
  ApiKeyForm: () => null,
  ConnectorLogo: ({ name }: { name: string }) =>
    createElement("span", null, name),
  DEFAULT_AUTH_FIELDS: [],
}));
vi.mock("@renderer/lib/analytics", () => ({ captureSuggestion: vi.fn() }));
vi.mock("@renderer/lib/connectors", () => ({ disconnectToolkit: vi.fn() }));
vi.mock("@renderer/lib/use-connector-connect", () => ({
  useConnectorConnect: () => ({
    connect: vi.fn(),
    connectWithCredentials: vi.fn(),
    cancel: vi.fn(),
    phases: {},
    error: null,
  }),
}));

import { ConnectSuggestions } from "./connect-suggestions";

describe("ConnectSuggestions", () => {
  it("keeps connection cards to one primary Connect action", () => {
    const markup = renderToStaticMarkup(
      createElement(ConnectSuggestions, {
        output: {
          suggestions: [
            { slug: "google", name: "Google", description: "Search your mail" },
          ],
        },
      }),
    );

    expect(markup).toContain(">Connect</button>");
    expect(markup).not.toContain("Not now");
    expect(markup).not.toContain(">Cancel</button>");
    expect(markup.match(/<button/g)).toHaveLength(1);
  });
});

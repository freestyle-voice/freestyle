import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useQuery } = vi.hoisted(() => ({ useQuery: vi.fn() }));

vi.mock("@renderer/components/connected-apps", () => ({
  ApiKeyForm: () => null,
  ConnectorLogo: ({ name }: { name: string }) =>
    createElement("span", null, name),
  DEFAULT_AUTH_FIELDS: [],
}));
vi.mock("@renderer/lib/analytics", () => ({
  capture: vi.fn(),
  captureSuggestion: vi.fn(),
}));
vi.mock("@renderer/lib/onboarding-core", () => ({
  starterPrompts: () => [
    "Look this up and keep it short",
    "Help me draft a message I've been putting off",
  ],
}));
vi.mock("@renderer/lib/openers", () => ({
  applyOpenerTemplate: vi.fn(),
  dismissedOpenerIds: () => [],
  dismissOpener: vi.fn(),
  fetchOpeners: vi.fn(),
}));
vi.mock("@renderer/lib/query", () => ({
  queryKeys: { openers: ["openers"], scheduled: { tasks: ["scheduled"] } },
}));
vi.mock("@renderer/lib/use-connector-connect", () => ({
  useConnectorConnect: () => ({
    connect: vi.fn(),
    connectWithCredentials: vi.fn(),
    phases: {},
    error: null,
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ isPending: false, isError: false, mutate: vi.fn() }),
  useQuery,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

import { OpenerCards } from "./opener-cards";

describe("OpenerCards", () => {
  beforeEach(() => {
    useQuery.mockReturnValue({
      isSuccess: true,
      isError: false,
      isFetching: false,
      data: {
        cards: [
          {
            id: "connect:google",
            kind: "connect",
            category: "connect",
            title: "Connect Google",
            subtitle: "Search your mail",
            action: {
              toolkitSlug: "google",
              toolkitName: "Google",
              authMode: "oauth",
            },
          },
        ],
        todos: [],
      },
    });
  });

  it("gives a connect opener only its primary connection action", () => {
    const markup = renderToStaticMarkup(
      createElement(OpenerCards, { busy: false, onPrompt: vi.fn() }),
    );

    expect(markup).toContain("Connect Google");
    expect(markup).not.toContain('aria-label="Dismiss: Connect Google"');
    expect(markup.match(/<button/g)).toHaveLength(1);
  });

  it("shows usable local starters while personalized openers load", () => {
    useQuery.mockReturnValue({
      isSuccess: false,
      isError: false,
      isFetching: true,
      data: undefined,
    });

    const markup = renderToStaticMarkup(
      createElement(OpenerCards, { busy: false, onPrompt: vi.fn() }),
    );

    expect(markup).toContain("Where should we start?");
    expect(markup).toContain("Look this up and keep it short");
    expect(markup).toContain("tavern-opener-suggestions");
    expect(markup).not.toContain('aria-busy="true"');
  });
});

import type { DependencyList, EffectCallback } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useHistorySearch } from "./use-history-search";

// A deterministic hook lifecycle, matching the renderer's node-only tests.
const harness = vi.hoisted(() => ({
  states: [] as unknown[],
  stateIndex: 0,
  effectIndex: 0,
  effects: [] as {
    dependencies?: DependencyList;
    cleanup?: () => void;
    pending?: EffectCallback;
  }[],
}));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = harness.stateIndex++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [
      harness.states[index],
      (next: unknown) => {
        harness.states[index] =
          typeof next === "function" ? next(harness.states[index]) : next;
      },
    ];
  },
  useCallback: (callback: unknown) => callback,
  useEffect: (effect: EffectCallback, dependencies: DependencyList) => {
    const index = harness.effectIndex++;
    const previous = harness.effects[index];
    if (
      !previous ||
      dependencies.some(
        (value, i) => !Object.is(value, previous.dependencies?.[i]),
      )
    ) {
      previous?.cleanup?.();
      harness.effects[index] = { dependencies, pending: effect };
    }
  },
}));

function render() {
  harness.stateIndex = 0;
  harness.effectIndex = 0;
  // biome-ignore lint/correctness/useHookAtTopLevel: hook lifecycle is mocked by this harness.
  const result = useHistorySearch();
  for (const effect of harness.effects) {
    if (effect.pending) {
      effect.cleanup = effect.pending() || undefined;
      effect.pending = undefined;
    }
  }
  return result;
}

beforeEach(() => {
  vi.useFakeTimers();
  harness.states = [];
  harness.effects = [];
});
afterEach(() => {
  for (const effect of harness.effects) effect.cleanup?.();
  vi.useRealTimers();
});

describe("history search debounce", () => {
  it("keeps typing immediate and commits only the final search with page zero", () => {
    let state = render();
    state.setPage(3);
    state.setSearch("h");
    state = render();
    expect(state).toMatchObject({ search: "h", querySearch: "", page: 3 });
    vi.advanceTimersByTime(100);
    state.setSearch(" hello ");
    state = render();
    vi.advanceTimersByTime(249);
    expect(render()).toMatchObject({
      search: " hello ",
      querySearch: "",
      page: 3,
    });
    vi.advanceTimersByTime(1);
    state = render();
    expect(state).toMatchObject({
      search: " hello ",
      querySearch: "hello",
      page: 0,
    });
    state.setPage(2);
    expect(render()).toMatchObject({ querySearch: "hello", page: 2 });
  });

  it("clears immediately and cancels pending typing", () => {
    let state = render();
    state.setSearch("hello");
    state = render();
    vi.advanceTimersByTime(250);
    state = render();
    state.setPage(2);
    state.setSearch("pending");
    state = render();
    vi.advanceTimersByTime(100);
    state.setSearch("");
    expect(render()).toMatchObject({ search: "", querySearch: "", page: 0 });
    vi.advanceTimersByTime(500);
    expect(render()).toMatchObject({ querySearch: "", page: 0 });
  });

  it("does not reset pagination for whitespace around the committed search", () => {
    let state = render();
    state.setSearch("hello");
    render();
    vi.advanceTimersByTime(250);
    state = render();
    state.setPage(2);
    state.setSearch(" hello ");
    render();
    vi.advanceTimersByTime(500);
    expect(render()).toMatchObject({ page: 2, querySearch: "hello" });
  });

  it("cancels a pending update when the page unmounts", () => {
    const state = render();
    state.setSearch("hello");
    render();
    for (const effect of harness.effects) effect.cleanup?.();
    vi.advanceTimersByTime(500);
    expect(harness.states[1]).toEqual({ page: 0, querySearch: "" });
  });
});

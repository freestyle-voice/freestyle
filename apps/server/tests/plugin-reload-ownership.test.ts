import { PluginRegistry } from "freestyle-voice";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acquireServerDatabase } from "../src/lib/db-ownership";

const state = vi.hoisted(() => ({
  load: vi.fn<() => Promise<PluginRegistry>>(),
}));
vi.mock("../src/lib/plugins/loader", () => ({ loadServerPlugins: state.load }));
const {
  initServerPlugins,
  reloadServerPlugins,
  disposeServerPlugins,
  plugins,
  pluginConfig,
} = await import("../src/lib/plugins/index");
let owner: ReturnType<typeof acquireServerDatabase>;

function fixture(name: string) {
  const dispose = vi.fn();
  const registry = new PluginRegistry([
    { name, config: () => ({ owner: name }), dispose },
  ]);
  return { registry, dispose };
}

beforeEach(async () => {
  state.load.mockReset();
  owner = acquireServerDatabase();
  state.load.mockResolvedValueOnce(fixture("initial").registry);
  await owner.run(initServerPlugins);
});
afterEach(async () => {
  await disposeServerPlugins();
  owner.revoke();
});

async function replaceOwner() {
  await owner.run(disposeServerPlugins);
  const previous = owner;
  previous.revoke();
  owner = acquireServerDatabase();
  const successor = fixture("successor");
  state.load.mockResolvedValueOnce(successor.registry);
  await owner.run(initServerPlugins);
  return { previous, successor };
}

function expectSuccessor(successor: ReturnType<typeof fixture>) {
  expect(plugins()).toBe(successor.registry);
  expect(pluginConfig()).toEqual({ owner: "successor" });
  expect(successor.dispose).not.toHaveBeenCalled();
}

describe("plugin reload ownership", () => {
  it("disposes a candidate loaded after shutdown without overwriting its successor", async () => {
    const retired = fixture("retired");
    let release!: () => void;
    state.load.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve(retired.registry);
        }),
    );
    const reload = owner.run(reloadServerPlugins);
    const { successor } = await replaceOwner();
    release();
    await expect(reload).rejects.toThrow("Server database owner has stopped");
    expectSuccessor(successor);
    expect(retired.dispose).toHaveBeenCalledOnce();
  });

  it("keeps a configuration candidate private and discards it if ownership changes during its hook", async () => {
    const retired = fixture("retired");
    let release!: () => void;
    let started!: () => void;
    const configuring = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.spyOn(retired.registry, "resolveConfig").mockImplementationOnce(() => {
      started();
      return new Promise((resolve) => {
        release = () => resolve({ owner: "retired" });
      });
    });
    state.load.mockResolvedValueOnce(retired.registry);
    const initial = plugins();
    const reload = owner.run(reloadServerPlugins);
    await configuring;
    expect(plugins()).toBe(initial);
    const { successor } = await replaceOwner();
    release();
    await expect(reload).rejects.toThrow("Server database owner has stopped");
    expectSuccessor(successor);
    expect(retired.dispose).toHaveBeenCalledOnce();
  });

  it("does not reset the successor registry when a stale loader rejects", async () => {
    let reject!: () => void;
    state.load.mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = () => fail(new Error("late load failure"));
        }),
    );
    const reload = owner.run(reloadServerPlugins);
    const { successor } = await replaceOwner();
    reject();
    await expect(reload).rejects.toThrow("Server database owner has stopped");
    expectSuccessor(successor);
  });

  it("disposes a stale configuration candidate when its hook rejects without clearing the successor", async () => {
    const retired = fixture("retired");
    let reject!: () => void;
    let started!: () => void;
    const configuring = new Promise<void>((resolve) => {
      started = resolve;
    });
    vi.spyOn(retired.registry, "resolveConfig").mockImplementationOnce(() => {
      started();
      return new Promise((_, fail) => {
        reject = () => fail(new Error("late config failure"));
      });
    });
    state.load.mockResolvedValueOnce(retired.registry);
    const reload = owner.run(reloadServerPlugins);
    await configuring;
    const { successor } = await replaceOwner();
    reject();
    await expect(reload).rejects.toThrow("Server database owner has stopped");
    expectSuccessor(successor);
    expect(retired.dispose).toHaveBeenCalledOnce();
  });

  it("rejects stale init/reload/disposal before mutating live plugin state", async () => {
    const { previous, successor } = await replaceOwner();
    const loads = state.load.mock.calls.length;
    await expect(previous.run(initServerPlugins)).rejects.toThrow(
      "Server database owner has stopped",
    );
    await expect(previous.run(reloadServerPlugins)).rejects.toThrow(
      "Server database owner has stopped",
    );
    expect(() => previous.run(disposeServerPlugins)).toThrow(
      "Server database owner has stopped",
    );
    expect(() => previous.run(plugins)).toThrow(
      "Server database owner has stopped",
    );
    expect(() => previous.run(pluginConfig)).toThrow(
      "Server database owner has stopped",
    );
    expect(state.load).toHaveBeenCalledTimes(loads);
    expectSuccessor(successor);
  });

  it("preserves the empty-registry fallback for a current-owner loading error", async () => {
    state.load.mockRejectedValueOnce(new Error("load failure"));
    await owner.run(reloadServerPlugins);
    expect(pluginConfig()).toEqual({});
    expect(plugins().collectMiddleware()).toEqual([]);
  });
});

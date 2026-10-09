import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  histogram: {
    enable: vi.fn(),
    disable: vi.fn(),
    reset: vi.fn(),
    percentile: vi.fn(),
    max: 0,
  },
  utilization: vi.fn(),
}));
vi.mock("node:perf_hooks", () => ({
  monitorEventLoopDelay: () => mocks.histogram,
  performance: { eventLoopUtilization: mocks.utilization },
}));

import { startEventLoopMonitor } from "./event-loop-monitor";

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe("main process event-loop diagnostics", () => {
  it("only reports slow windows and resets aggregate measurements", () => {
    vi.useFakeTimers();
    mocks.histogram.max = 30e6;
    mocks.histogram.percentile.mockReturnValue(25e6);
    mocks.utilization.mockReturnValue({ utilization: 0.2 });
    const report = vi.fn();
    const stop = startEventLoopMonitor(report, { intervalMs: 1000 });
    vi.advanceTimersByTime(1000);
    expect(report).not.toHaveBeenCalled();
    mocks.histogram.max = 500e6;
    vi.advanceTimersByTime(1000);
    expect(report).toHaveBeenCalledExactlyOnceWith({
      p99Ms: 25,
      maxMs: 500,
      utilization: 0.2,
    });
    expect(mocks.histogram.reset).toHaveBeenCalledTimes(2);
    stop();
    stop();
    vi.advanceTimersByTime(1000);
    expect(report).toHaveBeenCalledTimes(1);
    expect(mocks.histogram.disable).toHaveBeenCalledTimes(1);
  });
});

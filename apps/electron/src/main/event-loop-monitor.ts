import { monitorEventLoopDelay, performance } from "node:perf_hooks";

export interface EventLoopSample {
  p99Ms: number;
  maxMs: number;
  utilization: number;
}

/** Bounded, aggregate diagnostics; never records requests, audio, or text. */
export function startEventLoopMonitor(
  onSlowWindow: (sample: EventLoopSample) => void,
  { intervalMs = 60_000, thresholdMs = 250 } = {},
): () => void {
  const histogram = monitorEventLoopDelay({ resolution: 20 });
  let previous = performance.eventLoopUtilization();
  histogram.enable();
  const timer = setInterval(() => {
    const current = performance.eventLoopUtilization();
    const { utilization } = performance.eventLoopUtilization(current, previous);
    previous = current;
    const sample = {
      p99Ms: histogram.percentile(99) / 1e6,
      maxMs: histogram.max / 1e6,
      utilization,
    };
    histogram.reset();
    if (sample.maxMs >= thresholdMs) onSlowWindow(sample);
  }, intervalMs);
  timer.unref();
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    histogram.disable();
  };
}

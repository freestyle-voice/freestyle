export const REMIX_RECONNECT_DELAYS_MS = [
  3_000, 6_000, 12_000, 24_000, 30_000,
] as const;

export type RemixReconnectState =
  | { phase: "idle" }
  | { phase: "paused"; attempts: number }
  | { phase: "reconnecting"; attempts: number; retryAt: number };

/** Schedule at most five reconnects. `attempts` counts requests already made. */
export function nextRemixReconnect(
  attempts: number,
  now: number,
): RemixReconnectState {
  if (attempts >= REMIX_RECONNECT_DELAYS_MS.length)
    return { phase: "paused", attempts };
  return {
    phase: "reconnecting",
    attempts,
    retryAt: now + REMIX_RECONNECT_DELAYS_MS[attempts],
  };
}

export function remixReconnectLabel(
  state: RemixReconnectState,
  now: number,
): string | null {
  if (state.phase === "paused") return "Connection paused — Resume";
  if (state.phase !== "reconnecting") return null;
  const seconds = Math.max(0, Math.ceil((state.retryAt - now) / 1_000));
  return `Reconnecting — retry in ${seconds} second${seconds === 1 ? "" : "s"}`;
}

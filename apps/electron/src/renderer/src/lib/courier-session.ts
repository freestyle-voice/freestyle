import { getClient, initApiBase } from "./api";

export const COURIER_TOKEN_REFRESH_MS = 50 * 60 * 1000;
export const SIGNED_OUT_RETRY_MS = 5_000;
export const COURIER_ERROR_RETRY_MS = 30_000;

export interface CourierClientSession {
  userId: string;
  token: string;
}

export type CourierSessionResult =
  | ({ status: "ready" } & CourierClientSession)
  | { status: "signed-out" }
  | { status: "unavailable" };

export async function loadCourierSession(): Promise<CourierSessionResult> {
  try {
    await initApiBase();
    const response = await getClient().api.notifications.token.$post();
    if (response.status === 401) return { status: "signed-out" };
    if (!response.ok) return { status: "unavailable" };
    const payload = await response.json();
    if (
      typeof payload.userId !== "string" ||
      !payload.userId ||
      typeof payload.token !== "string" ||
      !payload.token
    ) {
      return { status: "unavailable" };
    }
    return {
      status: "ready",
      userId: payload.userId,
      token: payload.token,
    };
  } catch {
    return { status: "unavailable" };
  }
}

interface CourierSessionManagerOptions {
  load: () => Promise<CourierSessionResult>;
  onSession: (session: CourierClientSession) => Promise<void>;
  onSignedOut?: () => void;
  onUnavailable?: () => void;
}

/**
 * Owns Courier's short-lived client credential without putting timer and retry
 * policy inside React effects. A refresh replaces the Courier client before
 * the one-hour JWT expires; signed-out retries hit only the loopback proxy,
 * which returns before contacting Cloud when no session exists.
 */
export class CourierSessionManager {
  private running = false;
  private refreshing = false;
  private refreshPending = false;
  private generation = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: CourierSessionManagerOptions) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.refresh();
  }

  stop(): void {
    this.running = false;
    this.refreshPending = false;
    this.generation += 1;
    this.clearTimer();
  }

  refresh(): void {
    if (!this.running) return;
    this.clearTimer();
    if (this.refreshing) {
      this.refreshPending = true;
      return;
    }
    this.refreshing = true;
    const generation = ++this.generation;
    void this.run(generation).finally(() => {
      this.refreshing = false;
      if (!this.running || !this.refreshPending) return;
      this.refreshPending = false;
      this.refresh();
    });
  }

  private async run(generation: number): Promise<void> {
    const result = await this.options.load();
    if (!this.running || generation !== this.generation) return;

    if (result.status === "signed-out") {
      this.options.onSignedOut?.();
      this.schedule(SIGNED_OUT_RETRY_MS);
      return;
    }
    if (result.status === "unavailable") {
      this.options.onUnavailable?.();
      this.schedule(COURIER_ERROR_RETRY_MS);
      return;
    }

    try {
      await this.options.onSession({
        userId: result.userId,
        token: result.token,
      });
    } catch {
      if (!this.running || generation !== this.generation) return;
      this.options.onUnavailable?.();
      this.schedule(COURIER_ERROR_RETRY_MS);
      return;
    }
    if (!this.running || generation !== this.generation) return;
    this.schedule(COURIER_TOKEN_REFRESH_MS);
  }

  private schedule(delay: number): void {
    if (!this.running) return;
    this.timer = setTimeout(() => this.refresh(), delay);
  }

  private clearTimer(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}

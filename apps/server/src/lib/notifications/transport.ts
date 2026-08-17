import { createAppLogger } from "@freestyle-voice/utils";
import {
  fetchCloudNotifications,
  isTransientCloudError,
} from "../freestyle-cloud.js";
import { getSession, getSessionToken } from "../sessions.js";
import { notificationEvents } from "./events.js";
import { purgeExpired, upsertFromCloud } from "./store.js";

const log = createAppLogger("notification-transport");

const ACTIVE_INTERVAL_MS = 30_000;
const IDLE_INTERVAL_MS = 120_000;
const MAX_BACKOFF_MS = 300_000;
const ACTIVE_WINDOW_MS = 300_000;

export interface NotificationTransport {
  start(): void;
  stop(): void;
  refreshNow(): void;
}

type ChangeListener = () => void;

export class PollingTransport implements NotificationTransport {
  private timer: NodeJS.Timeout | null = null;
  private etag: string | null = null;
  private failures = 0;
  private lastActivityAt = 0;
  private polling = false;
  private readonly listeners = new Set<ChangeListener>();

  onChange(listener: ChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.timer) return;
    this.lastActivityAt = Date.now();
    void this.poll();
    this.schedule();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  refreshNow(): void {
    this.lastActivityAt = Date.now();
    this.failures = 0;
    void this.poll();
  }

  resetEtag(): void {
    this.etag = null;
  }

  private intervalMs(): number {
    if (this.failures > 0) {
      const backoff = ACTIVE_INTERVAL_MS * 2 ** Math.min(this.failures, 5);
      return Math.min(backoff, MAX_BACKOFF_MS);
    }
    const active = Date.now() - this.lastActivityAt < ACTIVE_WINDOW_MS;
    return active ? ACTIVE_INTERVAL_MS : IDLE_INTERVAL_MS;
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.poll().finally(() => this.schedule());
    }, this.intervalMs());
    this.timer.unref();
  }

  private async poll(): Promise<void> {
    if (this.polling) return;
    const token = getSessionToken();
    if (!token) return;

    this.polling = true;
    try {
      const result = await fetchCloudNotifications(token, this.etag);
      this.failures = 0;
      if (!result.changed) return;
      this.etag = result.etag;
      upsertFromCloud(
        result.notifications.map((n) => ({
          id: n.id,
          kind: n.kind,
          title: n.title,
          body: n.body,
          payload: n.payload,
          createdAt: n.createdAt,
          expiresAt: n.expiresAt,
        })),
        getSession()?.user.id ?? null,
      );
      purgeExpired();
      notificationEvents.emitChange();
      for (const listener of this.listeners) {
        try {
          listener();
        } catch {}
      }
    } catch (err) {
      this.failures += 1;
      if (!isTransientCloudError(err)) {
        log.debug(
          `Notification poll failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    } finally {
      this.polling = false;
    }
  }
}

export const notificationTransport = new PollingTransport();

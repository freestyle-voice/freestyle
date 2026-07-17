/**
 * Types for the pill plugin panel API. A plugin that contributes a pill panel
 * receives these types through the `window.freestyle.pill` bridge surface.
 */

/** The pill's current lifecycle state, mirroring the renderer's `PillState`. */
export type PillState = "idle" | "initializing" | "recording" | "transcribing";

/**
 * Events the pill emits to an active panel. The panel subscribes via
 * `window.freestyle.pill.subscribe(callback)`.
 */
export type PillEvent =
  | { type: "stateChanged"; state: PillState }
  | { type: "transcriptReady"; text: string };

/**
 * The pill panel bridge surface exposed on `window.freestyle.pill` inside a
 * plugin's pill panel page. This extends the base `FreestyleBridge` with
 * pill-scoped capabilities.
 */
export interface PillPanelBridge {
  /** Get the pill's current state. */
  getState(): Promise<PillState>;
  /** Subscribe to pill lifecycle events. Returns an unsubscribe function. */
  subscribe(callback: (event: PillEvent) => void): () => void;
  /** Expand the panel (resize the pill window to show the panel). */
  expand(): Promise<void>;
  /** Collapse the panel (shrink the pill window back to the pill chrome). */
  collapse(): Promise<void>;
  /**
   * Set a custom badge on the pill chrome (replaces the timer/pending-count).
   * Pass `null` to restore the default badge.
   */
  setBadge(text: string | null): Promise<void>;
}

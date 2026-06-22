import type { OutputMode } from "./output.js";

/**
 * Discriminated union of events emitted across the Freestyle dictation
 * pipeline. Plugins observe these through the read-only `event` hook; they
 * cannot influence behavior here — use the mutating hooks for that.
 *
 * Events originate from two processes:
 * - `server.*` events fire inside the Freestyle server (transcription,
 *   cleanup).
 * - `app.*` events fire inside the Electron main process (recording
 *   lifecycle, output/paste).
 */
export type FreestyleEvent =
  | { type: "app.recording.started"; appContext?: AppContext }
  | { type: "app.recording.committed" }
  | { type: "app.recording.cancelled" }
  | { type: "server.transcribed"; text: string; durationInSeconds?: number }
  | { type: "server.cleaned"; before: string; after: string }
  | { type: "app.output.delivered"; text: string; mode: OutputMode }
  | { type: "pipeline.error"; stage: PipelineStage; message: string };

export type PipelineStage =
  | "capture"
  | "transcribe"
  | "cleanup"
  | "transform"
  | "output";

/**
 * Best-effort description of the application the user was dictating into,
 * captured per-recording. Used for app-aware logic in hooks. Every field is
 * optional because OS introspection can fail or be unavailable.
 */
export interface AppContext {
  appName?: string;
  windowTitle?: string;
  url?: string;
  bundleId?: string;
}

import type { OutputMode } from "./output.js";

/**
 * Discriminated union of events emitted across the Freestyle dictation
 * pipeline. Plugins observe these through the read-only `event` hook; they
 * cannot influence behavior here — use the mutating hooks for that.
 *
 * Each event type is emitted by exactly one process — `recording*` and
 * `output*` fire in the Electron main process; `transcribed`/`cleaned` fire in
 * the server — so an `event` handler is delivered each event exactly once even
 * when the plugin is loaded in both processes.
 */
export type FreestyleEvent =
  | { type: "recordingStarted" }
  | { type: "recordingCommitted" }
  | { type: "recordingCancelled" }
  | { type: "transcribed"; text: string; durationInSeconds?: number }
  | { type: "cleaned"; before: string; after: string }
  | { type: "outputDelivered"; text: string; mode: OutputMode }
  | { type: "pipelineError"; stage: PipelineStage; message: string };

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

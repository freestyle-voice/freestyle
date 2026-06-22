/**
 * Discriminated union of events emitted across the Freestyle dictation
 * pipeline. Plugins observe these through the read-only `event` hook; they
 * cannot influence behavior here — use the mutating hooks for that.
 *
 * Events originate from two processes:
 * - `server.*` events fire inside the Freestyle server (transcription,
 *   cleanup, history).
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

/** How final text is delivered to the user's focused application. */
export type OutputMode = "paste" | "copy";

/**
 * Best-effort description of the application the user was dictating into,
 * captured per-recording. Used by contextual-correction hooks. Every field is
 * optional because OS introspection can fail or be unavailable.
 */
export interface AppContext {
  appName?: string;
  windowTitle?: string;
  url?: string;
  bundleId?: string;
}

import type { Plugin } from "@freestyle/sdk";

/**
 * The Audio File Transcription plugin. Its user-facing surface is the
 * `transcribe-files` UI page (declared in `package.json`), which uploads files
 * to the local server's `/api/transcribe` endpoint via the host bridge.
 *
 * The plugin's hook module is intentionally light — it has no pipeline hooks,
 * since transcribing dropped files doesn't alter live dictation. `setup` only
 * announces the plugin in logs.
 */
export default function audioTranscriptionPlugin(): Plugin {
  return {
    name: "freestyle-plugin-audio-transcription",
    setup({ logger, mode }) {
      logger.info(`audio-transcription ready on ${mode}`);
    },
  };
}

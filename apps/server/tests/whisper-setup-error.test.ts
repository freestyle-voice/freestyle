import { describe, expect, it } from "vitest";
import * as whisperLocal from "../src/lib/streaming/providers/whisper-local.js";

describe("Local Whisper setup errors", () => {
  it("turns a missing CMake prerequisite into a recoverable setup failure", () => {
    const error = new Error(
      "whisper-server binary not found and automatic setup failed: spawn cmake ENOENT",
    );

    expect(whisperLocal.getLocalWhisperSetupFailure(error)).toEqual({
      error: "local_whisper_setup_failed",
      reason: "cmake_missing",
      detail:
        "Local Whisper needs CMake to finish setup. Choose Freestyle Cloud or another model in Settings > Models.",
    });
  });

  it("recognizes the CMake preflight before a source build starts", () => {
    const error = new Error(
      "whisper-server binary not found and automatic setup failed: CMake is required to build Local Whisper. Install CMake and try again.",
    );

    expect(whisperLocal.getLocalWhisperSetupFailure(error)?.reason).toBe(
      "cmake_missing",
    );
  });
});

import { homedir } from "node:os";
import { join } from "node:path";

export const WHISPER_PROVIDER_ID = "local-whisper";

export interface WhisperModelDef {
  id: string;
  fileName: string;
  displayName: string;
  sizeBytes: number;
  ramRequired: string;
  speed: string;
  quality: string;
  quantized: boolean;
}

export const WHISPER_REPO = "ggerganov/whisper.cpp";
export const WHISPER_REPO_REVISION = "main";

/**
 * Curated catalog shown to users. Three tiers, no quantization variants —
 * the q5 builds are visually indistinguishable in quality at a third the size,
 * so only they ship; `medium` is dominated by large-v3-turbo on both axes.
 */
export const WHISPER_MODELS: WhisperModelDef[] = [
  {
    id: "base-q5_1",
    fileName: "ggml-base-q5_1.bin",
    displayName: "Whisper Fast",
    sizeBytes: 57_000_000,
    ramRequired: "~1 GB",
    speed: "Fastest",
    quality: "Good",
    quantized: true,
  },
  {
    id: "small-q5_1",
    fileName: "ggml-small-q5_1.bin",
    displayName: "Whisper Balanced",
    sizeBytes: 181_000_000,
    ramRequired: "~2 GB",
    speed: "Fast",
    quality: "Better",
    quantized: true,
  },
  {
    id: "large",
    fileName: "ggml-large-v3-turbo.bin",
    displayName: "Whisper Pro",
    sizeBytes: 1_600_000_000,
    ramRequired: "~6 GB",
    speed: "Medium",
    quality: "Best",
    quantized: false,
  },
];

/**
 * Removed from the catalog but still resolvable so existing installs that
 * downloaded (or defaulted to) one of these keep transcribing. They appear
 * in pickers only while downloaded.
 */
export const LEGACY_WHISPER_MODELS: WhisperModelDef[] = [
  {
    id: "tiny",
    fileName: "ggml-tiny.bin",
    displayName: "Whisper Tiny",
    sizeBytes: 75_000_000,
    ramRequired: "~1 GB",
    speed: "Fastest",
    quality: "Basic",
    quantized: false,
  },
  {
    id: "tiny-q5_1",
    fileName: "ggml-tiny-q5_1.bin",
    displayName: "Whisper Tiny Q5",
    sizeBytes: 31_000_000,
    ramRequired: "~1 GB",
    speed: "Fastest",
    quality: "Basic",
    quantized: true,
  },
  {
    id: "base",
    fileName: "ggml-base.bin",
    displayName: "Whisper Base",
    sizeBytes: 142_000_000,
    ramRequired: "~1 GB",
    speed: "Fast",
    quality: "Good",
    quantized: false,
  },
  {
    id: "small",
    fileName: "ggml-small.bin",
    displayName: "Whisper Small",
    sizeBytes: 466_000_000,
    ramRequired: "~2 GB",
    speed: "Medium",
    quality: "Better",
    quantized: false,
  },
  {
    id: "medium",
    fileName: "ggml-medium.bin",
    displayName: "Whisper Medium",
    sizeBytes: 1_500_000_000,
    ramRequired: "~5 GB",
    speed: "Slow",
    quality: "High",
    quantized: false,
  },
  {
    id: "medium-q5_0",
    fileName: "ggml-medium-q5_0.bin",
    displayName: "Whisper Medium Q5",
    sizeBytes: 539_000_000,
    ramRequired: "~3 GB",
    speed: "Medium",
    quality: "High",
    quantized: true,
  },
];

export function getWhisperModel(id: string): WhisperModelDef | undefined {
  return (
    WHISPER_MODELS.find((m) => m.id === id) ??
    LEGACY_WHISPER_MODELS.find((m) => m.id === id)
  );
}

export function getModelsDir(): string {
  return join(homedir(), ".cache", "freestyle", "whisper-models");
}

export function getModelPath(model: WhisperModelDef): string {
  return join(getModelsDir(), model.fileName);
}

// Linux arm64 is served by the source build, which produces the same
// binary names as x64. win32 stays x64-only: the prebuilt release zip has
// no arm64 variant and there is no Windows source-build path.
const BINARY_NAMES: Record<string, Record<string, string>> = {
  darwin: { arm64: "whisper-cli", x64: "whisper-cli" },
  linux: { x64: "whisper-cli", arm64: "whisper-cli" },
  win32: { x64: "whisper-cli.exe" },
};

const SERVER_NAMES: Record<string, Record<string, string>> = {
  darwin: { arm64: "whisper-server", x64: "whisper-server" },
  linux: { x64: "whisper-server", arm64: "whisper-server" },
  win32: { x64: "whisper-server.exe" },
};

export function getBinaryName(): string | null {
  const platform = process.platform;
  const arch = process.arch;
  return BINARY_NAMES[platform]?.[arch] ?? null;
}

export function getServerBinaryName(): string | null {
  const platform = process.platform;
  const arch = process.arch;
  return SERVER_NAMES[platform]?.[arch] ?? null;
}

export function isSupportedWhisperArch(): boolean {
  return getServerBinaryName() !== null;
}

export function unsupportedArchMessage(): string {
  return `Local Whisper transcription is not supported on ${process.platform}/${process.arch}. Choose a cloud model instead.`;
}

export function getResourcesDir(): string {
  const electronProcess = process as NodeJS.Process & {
    resourcesPath?: string;
  };
  if (electronProcess.resourcesPath) {
    return join(
      electronProcess.resourcesPath,
      "whisper",
      `${process.platform}-${process.arch}`,
    );
  }
  return join(
    process.cwd(),
    "resources",
    "whisper",
    `${process.platform}-${process.arch}`,
  );
}

export function getBinDir(): string {
  return join(homedir(), ".cache", "freestyle", "whisper-bin");
}

export const WHISPER_CPP_VERSION = "1.8.5";

export const WHISPER_SERVER_PORT = 8178;

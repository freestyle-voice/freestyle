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

/**
 * Hugging Face repo the GGML models are fetched from. Each model's `fileName`
 * (e.g. `ggml-tiny.bin`) doubles as its path within this repo. Pin `WHISPER_REPO_REVISION`
 * to a commit SHA for fully reproducible downloads; "main" tracks the latest.
 */
export const WHISPER_REPO = "ggerganov/whisper.cpp";
export const WHISPER_REPO_REVISION = "main";

export const WHISPER_MODELS: WhisperModelDef[] = [
  {
    id: "tiny",
    fileName: "ggml-tiny.bin",
    displayName: "Tiny",
    sizeBytes: 75_000_000,
    ramRequired: "~1 GB",
    speed: "Fastest",
    quality: "Basic",
    quantized: false,
  },
  {
    id: "tiny-q5_1",
    fileName: "ggml-tiny-q5_1.bin",
    displayName: "Tiny Q5",
    sizeBytes: 31_000_000,
    ramRequired: "~1 GB",
    speed: "Fastest",
    quality: "Basic",
    quantized: true,
  },
  {
    id: "base",
    fileName: "ggml-base.bin",
    displayName: "Base",
    sizeBytes: 142_000_000,
    ramRequired: "~1 GB",
    speed: "Fast",
    quality: "Good",
    quantized: false,
  },
  {
    id: "base-q5_1",
    fileName: "ggml-base-q5_1.bin",
    displayName: "Base Q5",
    sizeBytes: 57_000_000,
    ramRequired: "~1 GB",
    speed: "Very Fast",
    quality: "Good",
    quantized: true,
  },
  {
    id: "small",
    fileName: "ggml-small.bin",
    displayName: "Small",
    sizeBytes: 466_000_000,
    ramRequired: "~2 GB",
    speed: "Medium",
    quality: "Better",
    quantized: false,
  },
  {
    id: "small-q5_1",
    fileName: "ggml-small-q5_1.bin",
    displayName: "Small Q5",
    sizeBytes: 181_000_000,
    ramRequired: "~2 GB",
    speed: "Fast",
    quality: "Better",
    quantized: true,
  },
  {
    id: "medium",
    fileName: "ggml-medium.bin",
    displayName: "Medium",
    sizeBytes: 1_500_000_000,
    ramRequired: "~5 GB",
    speed: "Slow",
    quality: "High",
    quantized: false,
  },
  {
    id: "medium-q5_0",
    fileName: "ggml-medium-q5_0.bin",
    displayName: "Medium Q5",
    sizeBytes: 539_000_000,
    ramRequired: "~3 GB",
    speed: "Medium",
    quality: "High",
    quantized: true,
  },
  {
    id: "large",
    fileName: "ggml-large-v3-turbo.bin",
    displayName: "Large V3 Turbo",
    sizeBytes: 1_600_000_000,
    ramRequired: "~6 GB",
    speed: "Slow",
    quality: "Best",
    quantized: false,
  },
];

export function getWhisperModel(id: string): WhisperModelDef | undefined {
  return WHISPER_MODELS.find((m) => m.id === id);
}

export function getModelsDir(): string {
  return join(homedir(), ".cache", "freestyle", "whisper-models");
}

export function getModelPath(model: WhisperModelDef): string {
  return join(getModelsDir(), model.fileName);
}

const BINARY_NAMES: Record<string, Record<string, string>> = {
  darwin: { arm64: "whisper-cli", x64: "whisper-cli" },
  linux: { x64: "whisper-cli" },
  win32: { x64: "whisper-cli.exe" },
};

const SERVER_NAMES: Record<string, Record<string, string>> = {
  darwin: { arm64: "whisper-server", x64: "whisper-server" },
  linux: { x64: "whisper-server" },
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

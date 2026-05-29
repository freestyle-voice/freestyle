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
  url: string;
}

const HF_BASE = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

export const WHISPER_MODELS: WhisperModelDef[] = [
  {
    id: "tiny",
    fileName: "ggml-tiny.bin",
    displayName: "Tiny",
    sizeBytes: 75_000_000,
    ramRequired: "~1 GB",
    speed: "Fastest",
    quality: "Basic",
    url: `${HF_BASE}/ggml-tiny.bin`,
  },
  {
    id: "base",
    fileName: "ggml-base.bin",
    displayName: "Base",
    sizeBytes: 142_000_000,
    ramRequired: "~1 GB",
    speed: "Fast",
    quality: "Good",
    url: `${HF_BASE}/ggml-base.bin`,
  },
  {
    id: "small",
    fileName: "ggml-small.bin",
    displayName: "Small",
    sizeBytes: 466_000_000,
    ramRequired: "~2 GB",
    speed: "Medium",
    quality: "Better",
    url: `${HF_BASE}/ggml-small.bin`,
  },
  {
    id: "medium",
    fileName: "ggml-medium.bin",
    displayName: "Medium",
    sizeBytes: 1_500_000_000,
    ramRequired: "~5 GB",
    speed: "Slow",
    quality: "High",
    url: `${HF_BASE}/ggml-medium.bin`,
  },
  {
    id: "large",
    fileName: "ggml-large-v3-turbo.bin",
    displayName: "Large V3 Turbo",
    sizeBytes: 1_600_000_000,
    ramRequired: "~6 GB",
    speed: "Slow",
    quality: "Best",
    url: `${HF_BASE}/ggml-large-v3-turbo.bin`,
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

export const WHISPER_CPP_VERSION = "1.7.5";

export const WHISPER_SERVER_PORT = 8178;

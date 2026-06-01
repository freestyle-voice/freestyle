import { homedir } from "node:os";
import { join } from "node:path";

export const MLX_ASR_PROVIDER_ID = "local-mlx";

export const MLX_ASR_PROVIDER_NAME = "Local MLX";

export const MLX_UNSUPPORTED_PLATFORM_REASON =
  "Local MLX speech models require macOS on Apple Silicon (M1 or newer).";

export function isAppleSiliconMac(): boolean {
  return process.platform === "darwin" && process.arch === "arm64";
}

/** Avoid collision with whisper-server (8178). */
export const MLX_ASR_SERVER_PORT = 8179;

export interface MlxAsrModelDef {
  id: string;
  /** Hugging Face repo id passed to mlx-audio `load()`. */
  hfId: string;
  displayName: string;
  /** UI / registry grouping (e.g. qwen3-asr); not sent to the worker. */
  family: string;
  sizeBytes: number;
  ramRequired: string;
  speed: string;
  quality: string;
  quantized: boolean;
}

/** App catalog → passed to the worker as `--model <hfId>`. Any mlx-audio STT repo works. */
export const MLX_ASR_MODELS: MlxAsrModelDef[] = [
  {
    id: "qwen3-0.6b-5bit",
    hfId: "mlx-community/Qwen3-ASR-0.6B-5bit",
    family: "qwen3-asr",
    displayName: "Qwen3 ASR 0.6B (5-bit)",
    sizeBytes: 450_000_000,
    ramRequired: "~1.5 GB",
    speed: "Very Fast",
    quality: "Better",
    quantized: true,
  },
  {
    id: "qwen3-0.6b-8bit",
    hfId: "mlx-community/Qwen3-ASR-0.6B-8bit",
    family: "qwen3-asr",
    displayName: "Qwen3 ASR 0.6B (8-bit)",
    sizeBytes: 650_000_000,
    ramRequired: "~1.5 GB",
    speed: "Fast",
    quality: "Better",
    quantized: true,
  },
  {
    id: "qwen3-1.7b-8bit",
    hfId: "mlx-community/Qwen3-ASR-1.7B-8bit",
    family: "qwen3-asr",
    displayName: "Qwen3 ASR 1.7B (8-bit)",
    sizeBytes: 1_800_000_000,
    ramRequired: "~3 GB",
    speed: "Medium",
    quality: "High",
    quantized: true,
  },
];

export function getMlxAsrModel(id: string): MlxAsrModelDef | undefined {
  return MLX_ASR_MODELS.find((m) => m.id === id);
}

export function getMlxCacheDir(): string {
  return join(homedir(), ".cache", "freestyle", "mlx-asr");
}

export function getMlxRuntimeDir(): string {
  return join(
    getMlxCacheDir(),
    "runtime",
    `${process.platform}-${process.arch}`,
  );
}

export function getManagedMlxWorkerPath(): string {
  return join(getMlxRuntimeDir(), "mlx_asr_worker", "mlx_asr_worker");
}

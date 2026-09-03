export interface ConfiguredModel {
  id: number;
  provider: string;
  model_id: string;
  model_name: string;
  type: string;
  is_default: number;
}

export interface ApiKeyEntry {
  provider: string;
  created_at: string;
  status: "valid" | "invalid" | "unknown";
  /** Masked last-4 preview (e.g. "…a4F2") so keys are tellable apart. */
  hint?: string;
}

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
}

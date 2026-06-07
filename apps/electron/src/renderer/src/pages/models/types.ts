import type { LucideIcon } from "lucide-react";

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

/** Which inline picker is open. */
export type PickerType = "voice" | "llm" | null;

/** A filter chip shown in a model picker's filter bar. */
export type PickerFilter = {
  id: string;
  label: string;
  icon?: LucideIcon;
  mark?: string;
};

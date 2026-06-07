import { VoiceRow } from "@renderer/components/voice-row";
import type { AvailableModel, VoiceItem } from "@renderer/lib/models";
import {
  CircleDollarSign,
  Cloud,
  Laptop,
  Loader2,
  Mic,
  Target,
  Zap,
} from "lucide-react";
import { useState } from "react";

import { ModelPickerShell } from "./model-picker-shell";
import type { PickerFilter } from "./types";

// ---------------------------------------------------------------------------
// VoicePicker — unified on-device + cloud list with filter chips & meters
// ---------------------------------------------------------------------------

const VOICE_FILTERS: PickerFilter[] = [
  { id: "all", label: "All" },
  { id: "cloud", label: "Cloud", icon: Cloud },
  { id: "private", label: "On-device", icon: Laptop },
  { id: "fast", label: "Fastest", icon: Zap },
  { id: "accurate", label: "Most accurate", icon: Target },
  { id: "free", label: "No usage cost", icon: CircleDollarSign },
];

function applyVoiceFilter(items: VoiceItem[], filter: string): VoiceItem[] {
  if (filter === "private") return items.filter((m) => m.kind === "local");
  if (filter === "cloud") return items.filter((m) => m.kind === "cloud");
  if (filter === "free")
    return items.filter((m) => m.kind === "local" || m.cost === 0);
  if (filter === "fast")
    return items
      .filter((m) => (m.speed ?? 0) >= 4)
      .sort((a, b) => (b.speed ?? 0) - (a.speed ?? 0));
  if (filter === "accurate")
    return items
      .filter((m) => (m.quality ?? 0) >= 4)
      .sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0));
  return items;
}

export function VoicePicker({
  items,
  binaryDownloading,
  onSelectCloud,
  onSelectLocal,
  onDownload,
  onRetryLocal,
  onCancel,
  onDelete,
  onClose,
}: {
  items: VoiceItem[];
  binaryDownloading: boolean;
  onSelectCloud: (m: AvailableModel) => void;
  onSelectLocal: (
    defId: string,
    name: string,
    engine?: "whisper" | "mlx",
  ) => void;
  onDownload: (defId: string, engine?: "whisper" | "mlx") => void;
  onRetryLocal: (defId: string, engine: "whisper" | "mlx") => void;
  onCancel: (defId: string, engine?: "whisper" | "mlx") => void;
  onDelete: (defId: string, engine?: "whisper" | "mlx") => void;
  onClose: () => void;
}): React.JSX.Element {
  const [filter, setFilter] = useState("all");
  const list = applyVoiceFilter(items, filter);

  return (
    <ModelPickerShell
      icon={Mic}
      title="Choose a voice model"
      filters={VOICE_FILTERS}
      activeFilter={filter}
      onFilterChange={setFilter}
      banner={
        binaryDownloading ? (
          <div className="border-border flex items-center gap-2.5 border-b px-5 py-3">
            <Loader2 className="text-primary h-3.5 w-3.5 shrink-0 animate-spin" />
            <span className="text-muted-foreground text-[12px]">
              Building whisper.cpp from source — this may take a minute…
            </span>
          </div>
        ) : undefined
      }
      empty={list.length === 0}
      onClose={onClose}
    >
      {list.map((item, i) => (
        <VoiceRow
          key={item.key}
          item={item}
          first={i === 0}
          onSelectCloud={onSelectCloud}
          onSelectLocal={onSelectLocal}
          onDownload={onDownload}
          onRetryLocal={onRetryLocal}
          onCancel={onCancel}
          onDelete={onDelete}
        />
      ))}
    </ModelPickerShell>
  );
}

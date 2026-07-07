import { Button } from "@renderer/components/ui/button";
import type { AvailableModel } from "@renderer/lib/models";
import { cn, ON_DEVICE_PHRASE } from "@renderer/lib/utils";
import { Key, Laptop, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { PickerOption } from "./picker-option";
import type { ConfiguredModel } from "./types";
import type { UseModels } from "./use-models";
import { displayName } from "./utils";

export const FREESTYLE_CLOUD_CLEANUP: AvailableModel = {
  provider_id: "freestyle-cloud",
  provider_name: "Freestyle Transcribe",
  model_id: "freestyle-cloud/post-process",
  model_name: "Freestyle Cleanup",
  type: "llm",
};

const MANAGED_LLM_PROVIDERS = new Set([
  FREESTYLE_CLOUD_CLEANUP.provider_id,
  "local-llm",
]);

const PICKER_MODAL_BODY = "space-y-4 px-6 py-6";
const PICKER_MODAL_HEADER =
  "border-border flex shrink-0 items-center gap-3 border-b px-6 py-4";

function isLocalLlm(llm: ConfiguredModel | undefined): boolean {
  return llm?.provider === "local-llm";
}

function isByokLlm(llm: ConfiguredModel | undefined): boolean {
  if (!llm) return false;
  return !MANAGED_LLM_PROVIDERS.has(llm.provider);
}

/**
 * Cleanup picker: on-device and BYOK only. Freestyle cleanup is bundled with
 * Freestyle Transcribe and is not selectable on its own.
 */
export function CleanupPicker({
  m,
  layout,
  onClose,
  onBrowseLocal,
  onBrowseCloud,
}: {
  m: UseModels;
  layout: "page" | "modal";
  onClose?: () => void;
  onBrowseLocal: () => void;
  onBrowseCloud: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();

  const byokCount = [...m.llmModelsByProvider.entries()].reduce(
    (sum, [providerId, { models }]) =>
      providerId === FREESTYLE_CLOUD_CLEANUP.provider_id
        ? sum
        : sum + models.length,
    0,
  );

  const localActive = isLocalLlm(m.defaultLlm);
  const byokActive = isByokLlm(m.defaultLlm);

  const localHint = localActive
    ? (m.defaultLlm?.model_name ?? t("models.onDevice"))
    : m.localLlm.connected === true
      ? t("models.picker.modelCount", { count: m.localLlm.models.length })
      : t("models.picker.ollamaHint");

  const byokLabel = byokActive
    ? (m.defaultLlm?.model_name ?? displayName(m.defaultLlm!.provider))
    : byokCount > 0
      ? t("models.picker.cloudModelCount", { count: byokCount })
      : t("models.picker.byokProviders");

  const body = (
    <div
      className={cn(layout === "page" ? "mt-4 space-y-4" : PICKER_MODAL_BODY)}
    >
      <div className="border-border divide-border overflow-hidden rounded-[12px] border divide-y">
        <PickerOption
          icon={Laptop}
          title={t("models.picker.onDevice", { phrase: ON_DEVICE_PHRASE })}
          hint={localHint}
          active={localActive}
          onClick={onBrowseLocal}
          browseLabel={t("models.picker.browseLocalCleanup")}
        />
        <PickerOption
          icon={Key}
          title={t("models.picker.yourApiKey")}
          hint={byokLabel}
          active={byokActive}
          onClick={onBrowseCloud}
          browseLabel={t("models.picker.browseByokCleanup")}
        />
      </div>
    </div>
  );

  if (layout === "modal") {
    return (
      <>
        <header className={PICKER_MODAL_HEADER}>
          <Sparkles className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
          <span className="text-foreground flex-1 text-[13px] font-semibold">
            {t("models.picker.cleanup")}
          </span>
          {onClose && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              className="shrink-0"
              aria-label="Close"
            >
              <X />
            </Button>
          )}
        </header>
        {body}
      </>
    );
  }

  return body;
}

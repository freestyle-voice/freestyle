import { Button } from "@renderer/components/ui/button";
import { useTranslation } from "react-i18next";
import { ModelSettingRow } from "./model-setting-row";
import type { ConfiguredModel } from "./types";
import { displayName } from "./utils";

/** Remix is selected independently from dictation cleanup. */
export function RemixModelCard({
  model,
  signedIn,
  onChooseModel,
}: {
  model: ConfiguredModel | undefined;
  signedIn: boolean;
  onChooseModel: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const personal = !!model && model.provider !== "freestyle-cloud";
  return (
    <section data-testid="remix-model-configuration">
      <ModelSettingRow
        label="Remix"
        separator={false}
        model={personal ? model.model_name : "Freestyle Cloud"}
        detail={
          personal
            ? `${displayName(model.provider)} · sessions stay on this device`
            : signedIn
              ? t("models.overview.cloudChats", {
                  defaultValue: "Chats sync across your devices",
                })
              : t("models.overview.accountRequired", {
                  defaultValue: "Account required",
                })
        }
        actions={
          <Button variant="outline" size="sm" onClick={onChooseModel}>
            {personal || signedIn ? t("models.pair.change") : "Choose a model"}
          </Button>
        }
      >
        <p className="text-muted-foreground mt-1 text-[11px] leading-relaxed">
          {personal
            ? model.provider === "local-llm"
              ? t("models.processing.remixEndpoint", {
                  defaultValue:
                    "Chat text goes to your configured endpoint, which may be local or remote.",
                })
              : t("models.processing.remixProvider", {
                  defaultValue:
                    "Chat text goes to {{provider}}. This choice does not change dictation cleanup.",
                  provider: displayName(model.provider),
                })
            : t("models.processing.remixCloud", {
                defaultValue:
                  "Chat text is processed by Freestyle Cloud. This choice does not change dictation cleanup.",
              })}
        </p>
      </ModelSettingRow>
    </section>
  );
}

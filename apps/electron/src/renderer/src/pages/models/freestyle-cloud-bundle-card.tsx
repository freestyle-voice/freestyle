import { Button } from "@renderer/components/ui/button";
import { cn } from "@renderer/lib/utils";
import { Check, Cloud, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Eyebrow } from "./page-chrome";

/**
 * The one-click managed-model path. It deliberately configures both parts of
 * the dictation pipeline; choosing individual cloud providers still belongs in
 * the model pickers below.
 */
export function FreestyleCloudBundleCard({
  active,
  signedIn,
  busy,
  onUse,
}: {
  active: boolean;
  signedIn: boolean;
  busy: boolean;
  onUse: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <section
      className={cn(
        "border-border bg-card/55 relative overflow-hidden rounded-[12px] border",
        active && "border-primary/35 bg-primary/[0.045]",
      )}
      data-testid="freestyle-cloud-bundle"
    >
      <div className="flex flex-col gap-5 p-4 sm:p-5 min-[760px]:flex-row min-[760px]:items-center min-[760px]:justify-between">
        <div className="flex min-w-0 items-start gap-3.5">
          <span
            className={cn(
              "border-border bg-background/60 text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-[10px] border",
              active && "border-primary/35 bg-primary/10 text-primary",
            )}
          >
            {active ? (
              <Check className="size-[18px]" />
            ) : (
              <Cloud className="size-[18px]" />
            )}
          </span>
          <div className="min-w-0">
            <Eyebrow text={t("models.freestyleCloud.eyebrow")} accent />
            <h2 className="text-foreground mt-1 text-[17px] leading-[1.25] font-semibold tracking-[-0.015em]">
              {active
                ? t("models.freestyleCloud.activeTitle")
                : t("models.freestyleCloud.title")}
            </h2>
            <p className="text-muted-foreground mt-1.5 max-w-[570px] text-[13px] leading-[1.5]">
              {active
                ? t("models.freestyleCloud.activeDescription")
                : signedIn
                  ? t("models.freestyleCloud.signedInDescription")
                  : t("models.freestyleCloud.description")}
            </p>
          </div>
        </div>

        {!active && (
          <Button
            className="min-[760px]:self-center"
            disabled={busy}
            onClick={onUse}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Cloud />}
            {busy
              ? t("models.freestyleCloud.applying")
              : signedIn
                ? t("models.freestyleCloud.use")
                : t("models.freestyleCloud.signInAndUse")}
          </Button>
        )}
      </div>
    </section>
  );
}

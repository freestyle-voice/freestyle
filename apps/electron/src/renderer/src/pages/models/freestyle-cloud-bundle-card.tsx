import { Button } from "@renderer/components/ui/button";
import { Cloud, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

/** A quiet shortcut; detailed provider setup belongs in the model picker. */
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
}): React.JSX.Element | null {
  const { t } = useTranslation();
  if (active && signedIn) return null;
  return (
    <section
      className="border-border flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-5"
      data-testid="freestyle-cloud-bundle"
    >
      <div className="text-muted-foreground flex items-center gap-2 text-[12px]">
        <Cloud className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
        <span>
          {t("models.overview.cloudHint", {
            defaultValue: "Freestyle Cloud · no API key needed",
          })}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-foreground"
        disabled={busy}
        onClick={onUse}
      >
        {busy && <Loader2 className="animate-spin" />}
        {busy
          ? t("models.freestyleCloud.applying")
          : signedIn
            ? t("models.freestyleCloud.use")
            : t("models.overview.signIn", { defaultValue: "Sign in" })}
      </Button>
    </section>
  );
}

import { Skeleton } from "@renderer/components/ui/skeleton";
import { cn } from "@renderer/lib/utils";
import { useTranslation } from "react-i18next";
import { ModelSettingRow } from "./model-setting-row";
import { PageShell } from "./page-chrome";

export function ModelsSettingsFrame({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div
      className="mx-auto flex w-full max-w-5xl flex-col pb-8"
      data-testid="models-settings-page"
    >
      {children}
    </div>
  );
}

export function ModelsSettingsHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}): React.JSX.Element {
  return (
    <header className="mb-6">
      <h1 className="serif text-foreground m-0 text-[30px] font-normal leading-none tracking-[-0.025em] sm:text-[36px]">
        {title}
      </h1>
      <p className="text-muted-foreground mt-2 max-w-xl text-[13px] leading-[1.55]">
        {subtitle}
      </p>
    </header>
  );
}

function SkeletonLine({
  className,
}: {
  className?: string;
}): React.JSX.Element {
  return <Skeleton className={cn("rounded-full", className)} />;
}

export function ModelsLoadingSkeleton(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      className="space-y-5"
      role="status"
      aria-label="Loading models"
      aria-busy="true"
    >
      <div className="@container border-border bg-card/55 overflow-hidden rounded-[12px] border">
        {[
          t("models.picker.transcription"),
          t("models.picker.cleanup"),
          "Remix",
        ].map((label) => (
          <ModelSettingRow
            key={label}
            label={label}
            model={<SkeletonLine className="h-4 w-44 max-w-full" />}
            detail={<SkeletonLine className="h-3 w-32 max-w-full" />}
            actions={<SkeletonLine className="h-7 w-16 rounded-md" />}
          />
        ))}
        <div className="flex items-center justify-between px-4 py-3 sm:px-5">
          <SkeletonLine className="h-3 w-52 max-w-full" />
          <SkeletonLine className="h-7 w-16 rounded-md" />
        </div>
      </div>
      <div className="border-border rounded-[12px] border px-4 py-3.5 sm:px-5">
        <SkeletonLine className="h-4 w-28" />
      </div>
    </div>
  );
}

export function ModelsPageLoadingSkeleton(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <PageShell>
      <ModelsSettingsFrame>
        <ModelsSettingsHeader
          title={t("models.title", { defaultValue: "Models" })}
          subtitle={t("models.subtitle", {
            defaultValue:
              "Configure transcription and assistant models in one place.",
          })}
        />
        <ModelsLoadingSkeleton />
      </ModelsSettingsFrame>
    </PageShell>
  );
}

import { Button } from "@renderer/components/ui/button";
import { SegmentedControl } from "@renderer/components/ui/segmented-control";
import { cn } from "@renderer/lib/utils";
import { Check, ExternalLink, type Mic } from "lucide-react";
import { useTranslation } from "react-i18next";
import { type SettingsSectionId, settingsSectionIds } from "./constants";

// ---------------------------------------------------------------------------
// Layout primitives — Section / Row pattern from r-settings.jsx GeneralP1
// ---------------------------------------------------------------------------

export function SettingsSidebar({
  active,
  onSelect,
}: {
  active: SettingsSectionId;
  onSelect: (id: SettingsSectionId) => void;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <nav className="border-border flex h-full min-h-0 shrink-0 gap-1 overflow-x-auto pb-1 min-[900px]:flex-col min-[900px]:overflow-visible min-[900px]:border-r min-[900px]:pr-4 min-[900px]:pb-0">
      {settingsSectionIds.map((id) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            className={cn(
              "shrink-0 rounded-[7px] border px-2.5 py-1.5 text-left text-[13px] transition-colors min-[900px]:w-full",
              isActive
                ? "border-border bg-card text-foreground font-medium"
                : "text-secondary-foreground/80 hover:bg-card/50 border-transparent font-normal",
            )}
          >
            {t(`settings.sections.${id}`)}
          </button>
        );
      })}
    </nav>
  );
}

export function SettingsPanel({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return <div className="flex flex-col">{children}</div>;
}

export function Row({
  label,
  desc,
  children,
  last,
  stacked,
}: {
  label: string;
  desc: string;
  children: React.ReactNode;
  last?: boolean;
  stacked?: boolean;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "grid grid-cols-1 items-start gap-3 py-[22px] min-[1080px]:grid-cols-[220px_minmax(0,1fr)] min-[1080px]:gap-8 min-[1280px]:grid-cols-[280px_minmax(0,1fr)] min-[1280px]:gap-9",
        stacked &&
          "min-[1080px]:grid-cols-1 min-[1080px]:gap-4 min-[1280px]:grid-cols-1 min-[1280px]:gap-4",
        !last && "border-border border-b",
      )}
    >
      <div>
        <div className="text-foreground text-[15px] font-medium">{label}</div>
        <p className="text-muted-foreground mt-0.5 text-[12.5px] leading-[1.5]">
          {desc}
        </p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable controls
// ---------------------------------------------------------------------------

export type SegmentOption = {
  id: string;
  label: string;
  icon?: typeof Mic;
};

export function Segment({
  options,
  active,
  onSelect,
  compact,
  wrap,
}: {
  options: readonly SegmentOption[];
  active: string;
  onSelect: (id: string) => void;
  compact?: boolean;
  wrap?: boolean;
}): React.JSX.Element {
  return (
    <SegmentedControl
      options={options.map((o) => ({
        value: o.id,
        label: o.label,
        icon: o.icon,
      }))}
      value={active}
      onValueChange={onSelect}
      size={compact ? "sm" : "default"}
      wrap={wrap}
    />
  );
}

export function PermissionControl({
  granted,
  checking,
  actionLabel,
  external,
  onAction,
  onManage,
  note,
}: {
  granted: boolean;
  checking: boolean;
  actionLabel: string | null;
  external?: boolean;
  onAction?: () => void;
  onManage?: () => void;
  note?: string;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3">
      <StatusDot granted={granted} checking={checking} />
      {granted ? (
        <>
          <Check className="text-primary h-4 w-4" />
          {onManage && (
            <Button variant="outline" size="sm" onClick={onManage}>
              {t("common.manage")}
              <ExternalLink data-icon="inline-end" />
            </Button>
          )}
        </>
      ) : note ? (
        <span className="text-muted-foreground text-xs">{note}</span>
      ) : actionLabel && onAction ? (
        <Button variant="ink" size="sm" onClick={onAction}>
          {actionLabel}
          {external && <ExternalLink data-icon="inline-end" />}
        </Button>
      ) : null}
    </div>
  );
}

function StatusDot({
  granted,
  checking,
}: {
  granted: boolean;
  checking: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] font-medium tracking-wide uppercase",
        granted
          ? "text-primary"
          : checking
            ? "text-muted-foreground"
            : "text-destructive",
      )}
    >
      <span
        className={cn(
          "inline-block h-1.5 w-1.5 rounded-full",
          granted
            ? "bg-primary"
            : checking
              ? "bg-muted-foreground/40"
              : "bg-destructive",
        )}
      />
      {granted
        ? t("common.granted")
        : checking
          ? t("common.checking")
          : t("common.needed")}
    </span>
  );
}

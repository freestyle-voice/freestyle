import { DragSpacer } from "@renderer/components/drag-spacer";
import { Input } from "@renderer/components/ui/input";
import { SegmentedControl } from "@renderer/components/ui/segmented-control";
import { usePersistentState } from "@renderer/hooks/use-persistent-state";
import { Search } from "lucide-react";
import type React from "react";
import { useTranslation } from "react-i18next";

export type PluginsTab = "browse" | "installed";

export function usePluginsTab() {
  return usePersistentState<PluginsTab>(
    "plugins.activeTab",
    "browse",
    (value): value is PluginsTab => value === "browse" || value === "installed",
  );
}

/** Keep the route fallback and loaded page's title, toolbar and gutters identical. */
export function PluginsPageLayout({
  tab,
  onTabChange,
  query = "",
  onQueryChange,
  loading = false,
  children,
}: {
  tab: PluginsTab;
  onTabChange: (tab: PluginsTab) => void;
  query?: string;
  onQueryChange?: (query: string) => void;
  loading?: boolean;
  children: React.ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div
      className="flex h-full min-h-0 flex-col"
      aria-busy={loading || undefined}
    >
      <DragSpacer />
      <div className="responsive-page-scroll flex-1 overflow-auto">
        <header className="mb-7">
          <h1 className="serif text-foreground m-0 text-[48px] font-normal leading-[0.95] tracking-[-0.025em]">
            <span className="serif-italic text-primary">
              {t("plugins.titleAccent", { defaultValue: "Plugins" })}
            </span>
            <span>.</span>
          </h1>
          <p className="text-muted-foreground mt-2.5 max-w-[580px] text-[14px] leading-[1.5]">
            {t("plugins.subtitle", {
              defaultValue:
                "Install plugins to add features. Each runs in the dictation pipeline and can ship its own page.",
            })}
          </p>
        </header>
        <fieldset
          className="m-0 mb-5 flex min-w-0 items-center gap-3 border-0 p-0"
          disabled={loading}
        >
          <SegmentedControl
            value={tab}
            onValueChange={(value) => onTabChange(value as PluginsTab)}
            className="w-fit"
            options={[
              {
                value: "browse",
                label: t("plugins.tabs.browse", { defaultValue: "Browse" }),
              },
              {
                value: "installed",
                label: t("plugins.tabs.installed", {
                  defaultValue: "Installed",
                }),
              },
            ]}
          />
          <div className="relative max-w-[280px] flex-1">
            <Search className="text-muted-foreground/70 pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              type="text"
              value={query}
              onChange={(event) => onQueryChange?.(event.target.value)}
              placeholder={t("plugins.searchPlaceholder", {
                defaultValue: "Search plugins…",
              })}
              aria-label={t("plugins.searchPlaceholder", {
                defaultValue: "Search plugins…",
              })}
              className="h-10 pl-9 text-[13px]"
            />
          </div>
        </fieldset>
        {children}
      </div>
    </div>
  );
}

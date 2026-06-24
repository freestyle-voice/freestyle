import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Card } from "@renderer/components/ui/card";
import { SegmentedControl } from "@renderer/components/ui/segmented-control";
import type { PluginInfo } from "@shared/plugins";
import { Puzzle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

type Tab = "installed" | "browse";

export default function PluginsPage(): React.JSX.Element {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("installed");
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Actively re-scan installed plugins each time the hub opens, so the list
      // is correct even if discovery hadn't completed when the app started.
      setPlugins(await window.api.refreshPlugins());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="h-7 shrink-0" />
      <div
        className="responsive-page-scroll flex-1 overflow-auto"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <header className="mb-6">
          <span className="mono text-muted-foreground text-[10px] uppercase tracking-[0.16em]">
            {t("plugins.eyebrow")}
          </span>
          <h1 className="serif text-foreground m-0 mt-2 text-[48px] font-normal leading-[0.95] tracking-[-0.025em]">
            <span className="serif-italic text-primary">
              {t("plugins.titleAccent")}
            </span>
            <span>.</span>
          </h1>
          <p className="text-muted-foreground mt-2 max-w-[580px] text-[14px] leading-[1.5]">
            {t("plugins.subtitle")}
          </p>
        </header>

        <SegmentedControl
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          className="mb-5 w-fit"
          options={[
            { value: "installed", label: t("plugins.tabs.installed") },
            { value: "browse", label: t("plugins.tabs.browse") },
          ]}
        />

        {tab === "installed" ? (
          <InstalledTab loading={loading} plugins={plugins} />
        ) : (
          <BrowseTab />
        )}
      </div>
    </div>
  );
}

function InstalledTab({
  loading,
  plugins,
}: {
  loading: boolean;
  plugins: PluginInfo[];
}): React.JSX.Element {
  const { t } = useTranslation();

  if (loading) {
    return (
      <p className="text-muted-foreground text-sm">{t("plugins.loading")}</p>
    );
  }
  if (plugins.length === 0) {
    return (
      <div className="border-border bg-card rounded-[14px] border border-dashed px-9 py-[52px] text-center">
        <Puzzle className="text-muted-foreground mx-auto mb-3 h-6 w-6" />
        <p className="text-muted-foreground text-sm">{t("plugins.empty")}</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {plugins.map((plugin) => (
        <PluginCard key={plugin.name} plugin={plugin} />
      ))}
    </div>
  );
}

function PluginCard({ plugin }: { plugin: PluginInfo }): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const page = plugin.pages[0];

  return (
    <Card className="flex items-center gap-4 p-5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-foreground truncate text-[15px] font-medium">
            {displayName(plugin)}
          </span>
          {plugin.local ? (
            <Badge
              variant="outline"
              className="mono text-[9px] tracking-[0.14em]"
            >
              {t("plugins.localBadge")}
            </Badge>
          ) : null}
        </div>
        {plugin.description ? (
          <p className="text-muted-foreground mt-1 line-clamp-2 text-[13px]">
            {plugin.description}
          </p>
        ) : null}
        <span className="mono text-muted-foreground mt-2 block text-[10px] uppercase tracking-[0.14em]">
          {t("plugins.pageCount", { count: plugin.pages.length })}
        </span>
      </div>
      {page ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/plugins/${plugin.slug}/${page.id}`)}
        >
          {t("plugins.open")}
        </Button>
      ) : null}
    </Card>
  );
}

function BrowseTab(): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <div className="border-border bg-card rounded-[14px] border border-dashed px-9 py-[52px] text-center">
      <p className="text-foreground text-sm">{t("plugins.browseSoonTitle")}</p>
      <p className="text-muted-foreground mt-1 text-[13px]">
        {t("plugins.browseSoonBody")}
      </p>
    </div>
  );
}

/** Strip a `freestyle-plugin-` / `@scope/plugin-` prefix for a friendlier name. */
function displayName(plugin: PluginInfo): string {
  return plugin.name
    .replace(/^@[^/]+\//, "")
    .replace(/^freestyle-plugin-/, "")
    .replace(/^plugin-/, "");
}

import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { SegmentedControl } from "@renderer/components/ui/segmented-control";
import { Switch } from "@renderer/components/ui/switch";
import type { PluginCatalogEntry, PluginInfo } from "@shared/plugins";
import { ArrowRight, Info, Puzzle, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { pluginDisplayName, resolvePluginIcon } from "./helpers";

type Tab = "browse" | "installed";

export default function PluginsPage(): React.JSX.Element {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("browse");
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
        <header className="mb-7">
          <h1 className="serif text-foreground m-0 text-[48px] font-normal leading-[0.95] tracking-[-0.025em]">
            <span className="serif-italic text-primary">
              {t("plugins.titleAccent")}
            </span>
            <span>.</span>
          </h1>
          <p className="text-muted-foreground mt-2.5 max-w-[580px] text-[14px] leading-[1.5]">
            {t("plugins.subtitle")}
          </p>
        </header>

        <SegmentedControl
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          className="mb-5 w-fit"
          options={[
            { value: "browse", label: t("plugins.tabs.browse") },
            { value: "installed", label: t("plugins.tabs.installed") },
          ]}
        />

        {tab === "browse" ? (
          <BrowseTab installed={plugins} onChange={setPlugins} />
        ) : (
          <InstalledTab
            loading={loading}
            plugins={plugins}
            onChange={setPlugins}
          />
        )}
      </div>
    </div>
  );
}

function InstalledTab({
  loading,
  plugins,
  onChange,
}: {
  loading: boolean;
  plugins: PluginInfo[];
  onChange: (plugins: PluginInfo[]) => void;
}): React.JSX.Element {
  const { t } = useTranslation();

  if (loading) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        {t("plugins.loading")}
      </p>
    );
  }
  if (plugins.length === 0) {
    return (
      <div className="border-border bg-card rounded-[14px] border border-dashed px-9 py-[52px] text-center">
        <div className="border-border bg-secondary mx-auto mb-4 flex size-12 items-center justify-center rounded-[12px] border">
          <Puzzle className="text-muted-foreground size-5" strokeWidth={1.7} />
        </div>
        <h2 className="serif text-foreground m-0 text-[22px] leading-tight">
          {t("plugins.emptyTitle")}
        </h2>
        <p className="text-muted-foreground mx-auto mt-1.5 max-w-[360px] text-[13px] leading-[1.5]">
          {t("plugins.empty")}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {plugins.map((plugin) => (
        <PluginCard key={plugin.name} plugin={plugin} onChange={onChange} />
      ))}
    </div>
  );
}

function PluginCard({
  plugin,
  onChange,
}: {
  plugin: PluginInfo;
  onChange: (plugins: PluginInfo[]) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const Icon = resolvePluginIcon(plugin.icon ?? plugin.pages[0]?.icon);

  const page = plugin.pages[0];

  const [busy, setBusy] = useState(false);

  const toggle = async (enabled: boolean): Promise<void> => {
    onChange(await window.api.setPluginEnabled(plugin.specifier, enabled));
  };

  const uninstall = async (): Promise<void> => {
    setBusy(true);
    try {
      onChange(await window.api.uninstallPlugin(plugin.specifier));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-border bg-card hover:bg-card/70 flex w-full items-center gap-4 rounded-[14px] border p-5 transition-colors">
      <div className="border-border bg-secondary flex size-11 shrink-0 items-center justify-center rounded-[10px] border">
        <Icon
          className={
            plugin.enabled
              ? "text-primary size-5"
              : "text-muted-foreground size-5"
          }
          strokeWidth={1.7}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-foreground truncate text-[14.5px] font-medium">
            {pluginDisplayName(plugin)}
          </span>
          {plugin.version ? (
            <span className="mono text-muted-foreground text-[10px]">
              v{plugin.version}
            </span>
          ) : null}
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
          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-[13px]">
            {plugin.description}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {page ? (
          <Button
            variant="outline"
            size="sm"
            disabled={!plugin.enabled}
            onClick={() => navigate(`/plugins/${plugin.slug}/${page.id}`)}
          >
            {t("plugins.open")}
            <ArrowRight data-icon="inline-end" />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("plugins.detail.title")}
          onClick={() => navigate(`/plugins/${plugin.slug}`)}
        >
          <Info className="text-muted-foreground" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("plugins.uninstall")}
          disabled={busy}
          onClick={() => void uninstall()}
        >
          <Trash2 className="text-muted-foreground" />
        </Button>
        <Switch
          checked={plugin.enabled}
          onCheckedChange={(v) => void toggle(v)}
          aria-label={t(
            plugin.enabled ? "plugins.disablePlugin" : "plugins.enablePlugin",
          )}
        />
      </div>
    </div>
  );
}

function BrowseTab({
  installed,
  onChange,
}: {
  installed: PluginInfo[];
  onChange: (plugins: PluginInfo[]) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState<PluginCatalogEntry[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    window.api
      .getPluginCatalog()
      .then((res) => {
        if (active) setCatalog(res.plugins);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (error) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        {t("plugins.browse.error")}
      </p>
    );
  }
  if (!catalog) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        {t("plugins.loading")}
      </p>
    );
  }
  const installedNames = new Set(installed.map((p) => p.specifier));
  return (
    <div className="flex flex-col gap-3">
      {catalog.map((entry) => (
        <CatalogCard
          key={entry.npmName}
          entry={entry}
          installed={installedNames.has(entry.npmName)}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function CatalogCard({
  entry,
  installed,
  onChange,
}: {
  entry: PluginCatalogEntry;
  installed: boolean;
  onChange: (plugins: PluginInfo[]) => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const Icon = resolvePluginIcon(entry.icon);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const install = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      onChange(await window.api.installPlugin(entry.npmName));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-border bg-card flex w-full items-center gap-4 rounded-[14px] border p-5">
      <div className="border-border bg-secondary flex size-11 shrink-0 items-center justify-center rounded-[10px] border">
        <Icon className="text-primary size-5" strokeWidth={1.7} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-foreground truncate text-[14.5px] font-medium">
            {entry.title}
          </span>
          {entry.author ? (
            <span className="mono text-muted-foreground text-[10px]">
              {entry.author}
            </span>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-0.5 line-clamp-1 text-[13px]">
          {entry.description}
        </p>
        {error ? (
          <p className="text-destructive mt-1 line-clamp-2 text-[12px]">
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {installed ? (
          <Badge
            variant="outline"
            className="mono text-[9px] tracking-[0.14em]"
          >
            {t("plugins.installed")}
          </Badge>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => void install()}
          >
            {busy ? t("plugins.installing") : t("plugins.install")}
          </Button>
        )}
      </div>
    </div>
  );
}

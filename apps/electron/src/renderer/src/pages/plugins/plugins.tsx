import { DragSpacer } from "@renderer/components/drag-spacer";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@renderer/components/ui/dropdown-menu";
import { Input } from "@renderer/components/ui/input";
import { SegmentedControl } from "@renderer/components/ui/segmented-control";
import { usePersistentState } from "@renderer/hooks/use-persistent-state";
import type {
  PluginCatalogEntry,
  PluginInfo,
  PluginUpdateResult,
} from "@shared/plugins";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Loader2, MoreHorizontal, Puzzle, Search } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import {
  pluginDisplayName,
  resolvePluginIcon,
  usePluginUpdates,
} from "./helpers";
import { PluginsLoadingSkeleton } from "./plugin-skeletons";

type Tab = "browse" | "installed";

const isTab = (value: string): value is Tab =>
  value === "browse" || value === "installed";

export default function PluginsPage(): React.JSX.Element {
  const { t } = useTranslation();
  const [tab, setTab] = usePersistentState<Tab>(
    "plugins.activeTab",
    "browse",
    isTab,
  );
  const [query, setQuery] = useState("");
  const queryClient = useQueryClient();

  const { data: plugins = [], isLoading: loading } = useQuery({
    queryKey: ["plugins"],
    queryFn: () => window.api.refreshPlugins(),
    placeholderData: keepPreviousData,
  });

  const setPlugins = useCallback(
    (updated: PluginInfo[]) => {
      queryClient.setQueryData(["plugins"], updated);
    },
    [queryClient],
  );

  const { data: updatesMap } = usePluginUpdates(plugins);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DragSpacer />
      <div className="responsive-page-scroll flex-1 overflow-auto">
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

        <div className="mb-5 flex items-center gap-3">
          <SegmentedControl
            value={tab}
            onValueChange={(v) => setTab(v as Tab)}
            className="w-fit"
            options={[
              { value: "browse", label: t("plugins.tabs.browse") },
              { value: "installed", label: t("plugins.tabs.installed") },
            ]}
          />
          <div className="relative max-w-[280px] flex-1">
            <Search className="text-muted-foreground/70 pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
            <Input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("plugins.searchPlaceholder")}
              aria-label={t("plugins.searchPlaceholder")}
              className="h-9 pl-9 text-[13px]"
            />
          </div>
        </div>

        {tab === "browse" ? (
          <BrowseTab
            installed={plugins}
            query={query}
            onChange={setPlugins}
            updates={updatesMap}
          />
        ) : (
          <InstalledTab
            loading={loading}
            plugins={plugins}
            query={query}
            onChange={setPlugins}
            updates={updatesMap}
          />
        )}
      </div>
    </div>
  );
}

/** Case-insensitive substring match across a plugin's display fields. */
function matchesQuery(
  query: string,
  fields: Array<string | undefined>,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return fields.some((f) => f?.toLowerCase().includes(q));
}

function InstalledTab({
  loading,
  plugins,
  query,
  onChange,
  updates,
}: {
  loading: boolean;
  plugins: PluginInfo[];
  query: string;
  onChange: (plugins: PluginInfo[]) => void;
  updates?: Map<string, PluginUpdateResult>;
}): React.JSX.Element {
  const { t } = useTranslation();

  const filtered = useMemo(
    () =>
      plugins.filter((p) =>
        matchesQuery(query, [pluginDisplayName(p), p.description, p.specifier]),
      ),
    [plugins, query],
  );

  if (loading) {
    return <PluginsLoadingSkeleton />;
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
  if (filtered.length === 0) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        {t("plugins.noResults")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {filtered.map((plugin) => (
        <PluginCard
          key={plugin.specifier}
          plugin={plugin}
          onChange={onChange}
          update={updates?.get(plugin.specifier)}
        />
      ))}
    </div>
  );
}

function PluginCard({
  plugin,
  onChange,
  update,
}: {
  plugin: PluginInfo;
  onChange: (plugins: PluginInfo[]) => void;
  update?: PluginUpdateResult;
}): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const Icon = resolvePluginIcon(plugin.icon ?? plugin.pages[0]?.icon);

  const [busy, setBusy] = useState(false);
  const [updating, setUpdating] = useState(false);

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

  const doUpdate = async (): Promise<void> => {
    setUpdating(true);
    try {
      onChange(await window.api.installPlugin(plugin.specifier));
      // Invalidate the update-check cache so the badge disappears immediately.
      void queryClient.invalidateQueries({ queryKey: ["plugin-updates"] });
    } catch {
      // Install errors surface via the server; no UI toast needed here.
    } finally {
      setUpdating(false);
    }
  };

  const isDev = plugin.slug.endsWith("-dev");

  return (
    <button
      type="button"
      className="border-border bg-card hover:bg-card/70 flex w-full cursor-pointer items-center gap-4 rounded-[14px] border p-5 text-left transition-colors"
      onClick={() => navigate(`/plugins/${plugin.slug}`)}
    >
      <div className="border-border bg-secondary flex size-11 shrink-0 items-center justify-center rounded-[10px] border">
        <Icon
          className={
            plugin.enabled && !plugin.missing
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
          {isDev ? (
            <Badge
              variant="outline"
              className="mono h-4 border-yellow-500/30 bg-yellow-500/15 px-1.5 text-[9px] text-yellow-700 uppercase tracking-[0.12em] dark:text-yellow-300"
            >
              Dev
            </Badge>
          ) : null}
          {update?.updateAvailable ? (
            <Badge
              variant="outline"
              className="mono text-primary border-primary/40 text-[9px] tracking-[0.14em]"
            >
              {t("plugins.updateAvailable", {
                version: update.latestVersion,
              })}
            </Badge>
          ) : null}
          {plugin.missing ? (
            <Badge
              variant="outline"
              className="mono text-destructive border-destructive/40 text-[9px] tracking-[0.14em]"
            >
              {t("plugins.missingBadge")}
            </Badge>
          ) : null}
        </div>
        <p className="text-muted-foreground mt-0.5 line-clamp-1 text-[13px]">
          {plugin.missing
            ? t("plugins.missingHint")
            : (plugin.description ?? plugin.specifier)}
        </p>
      </div>

      <div
        className="flex shrink-0 items-center gap-2"
        onClickCapture={(e) => e.stopPropagation()}
      >
        {!plugin.missing && update?.updateAvailable ? (
          <Button
            variant="outline"
            size="sm"
            disabled={updating}
            onClick={() => void doUpdate()}
          >
            {updating ? <Loader2 className="animate-spin" /> : null}
            {updating ? t("plugins.updating") : t("plugins.update")}
          </Button>
        ) : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("plugins.more")}
            >
              <MoreHorizontal className="text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!plugin.missing ? (
              <>
                <DropdownMenuItem onClick={() => void toggle(!plugin.enabled)}>
                  {t(
                    plugin.enabled
                      ? "plugins.disablePlugin"
                      : "plugins.enablePlugin",
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            ) : null}
            <DropdownMenuItem
              variant="destructive"
              disabled={busy}
              onClick={() => void uninstall()}
            >
              {t("plugins.uninstall")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </button>
  );
}

function BrowseTab({
  installed,
  query,
  onChange,
  updates,
}: {
  installed: PluginInfo[];
  query: string;
  onChange: (plugins: PluginInfo[]) => void;
  updates?: Map<string, PluginUpdateResult>;
}): React.JSX.Element {
  const { t } = useTranslation();

  const { data: catalog, isError: error } = useQuery({
    queryKey: ["plugin-catalog"],
    queryFn: async () => {
      const res = await window.api.getPluginCatalog();
      return res.plugins;
    },
    placeholderData: keepPreviousData,
    retry: 1,
  });

  const installedBySpecifier = useMemo(
    () => new Map(installed.map((p) => [p.specifier, p])),
    [installed],
  );

  const filtered = useMemo(
    () =>
      (catalog ?? []).filter((e) =>
        matchesQuery(query, [e.title, e.description, e.npmName, e.author]),
      ),
    [catalog, query],
  );

  if (error) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        {t("plugins.browse.error")}
      </p>
    );
  }
  if (!catalog) {
    return <PluginsLoadingSkeleton />;
  }
  if (filtered.length === 0) {
    return (
      <p className="text-muted-foreground py-10 text-center text-sm">
        {t("plugins.noResults")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {filtered.map((entry) => {
        // If a catalog plugin is already installed, render the full installed
        // card so it can be opened/used directly — not just an "Installed" pill.
        const installedPlugin = installedBySpecifier.get(entry.npmName);
        return installedPlugin ? (
          <PluginCard
            key={entry.npmName}
            plugin={installedPlugin}
            onChange={onChange}
            update={updates?.get(installedPlugin.specifier)}
          />
        ) : (
          <CatalogCard key={entry.npmName} entry={entry} onChange={onChange} />
        );
      })}
    </div>
  );
}

function CatalogCard({
  entry,
  onChange,
}: {
  entry: PluginCatalogEntry;
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
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void install()}
        >
          {busy ? t("plugins.installing") : t("plugins.install")}
        </Button>
      </div>
    </div>
  );
}

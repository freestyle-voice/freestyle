import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { SegmentedControl } from "@renderer/components/ui/segmented-control";
import { Switch } from "@renderer/components/ui/switch";
import type { PluginInfo } from "@shared/plugins";
import { ArrowRight, Check, Copy, Info, Puzzle } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { pluginDisplayName, resolvePluginIcon } from "./helpers";

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
            { value: "installed", label: t("plugins.tabs.installed") },
            { value: "browse", label: t("plugins.tabs.browse") },
          ]}
        />

        {tab === "installed" ? (
          <InstalledTab
            loading={loading}
            plugins={plugins}
            onChange={setPlugins}
          />
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

  const toggle = async (enabled: boolean): Promise<void> => {
    onChange(await window.api.setPluginEnabled(plugin.specifier, enabled));
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
        <Switch
          checked={plugin.enabled}
          onCheckedChange={(v) => void toggle(v)}
          aria-label={t("plugins.toggleEnabled")}
        />
      </div>
    </div>
  );
}

function BrowseTab(): React.JSX.Element {
  const { t } = useTranslation();
  const settingExample = JSON.stringify(
    ["@your-org/freestyle-plugin-example"],
    null,
    2,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="border-border bg-card rounded-[14px] border p-6">
        <span className="mono text-muted-foreground text-[10px] uppercase tracking-[0.16em]">
          {t("plugins.browse.registrySoonEyebrow")}
        </span>
        <p className="text-foreground mt-2 text-sm">
          {t("plugins.browse.registrySoonTitle")}
        </p>
        <p className="text-muted-foreground mt-1 text-[13px] leading-[1.5]">
          {t("plugins.browse.registrySoonBody")}
        </p>
      </div>

      <div className="border-border bg-card rounded-[14px] border p-6">
        <span className="mono text-muted-foreground text-[10px] uppercase tracking-[0.16em]">
          {t("plugins.browse.manualEyebrow")}
        </span>
        <p className="text-muted-foreground mt-2 text-[13px] leading-[1.5]">
          {t("plugins.browse.manualNpm")}
        </p>
        <CodeExample value={settingExample} />
        <p className="text-muted-foreground mt-4 text-[13px] leading-[1.5]">
          {t("plugins.browse.manualLocal")}
        </p>
        <CodeExample value="<userData>/plugins/my-plugin/" />
      </div>
    </div>
  );
}

function CodeExample({ value }: { value: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const copy = (): void => {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };
  return (
    <div className="border-border bg-secondary/40 relative mt-2 rounded-[9px] border">
      <pre className="mono text-foreground overflow-auto p-3 pr-12 text-[12px] leading-[1.55]">
        {value}
      </pre>
      <Button
        variant="ghost"
        size="icon-sm"
        className="absolute right-1.5 top-1.5"
        onClick={copy}
        aria-label="Copy"
      >
        {copied ? (
          <Check className="text-primary" />
        ) : (
          <Copy className="text-muted-foreground" />
        )}
      </Button>
    </div>
  );
}

import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { SegmentedControl } from "@renderer/components/ui/segmented-control";
import type { PluginInfo } from "@shared/plugins";
import {
  ArrowRight,
  Check,
  Copy,
  type LucideIcon,
  icons as lucideIcons,
  Puzzle,
} from "lucide-react";
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

  const Icon = resolveIcon(page?.icon);

  return (
    <div className="border-border bg-card hover:border-foreground/15 group flex items-center gap-4 rounded-[14px] border p-4 transition-colors">
      <div className="border-border bg-accent/40 flex size-11 shrink-0 items-center justify-center rounded-[10px] border">
        <Icon className="text-primary size-5" strokeWidth={1.7} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-foreground truncate text-[14.5px] font-medium">
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
          <p className="text-muted-foreground mt-0.5 line-clamp-1 text-[13px]">
            {plugin.description}
          </p>
        ) : null}
        <span className="mono text-muted-foreground mt-1.5 block text-[10px] uppercase tracking-[0.14em]">
          {t("plugins.pageCount", { count: plugin.pages.length })}
        </span>
      </div>

      {page ? (
        <Button
          variant="outline"
          size="sm"
          className="shrink-0"
          onClick={() => navigate(`/plugins/${plugin.slug}/${page.id}`)}
        >
          {t("plugins.open")}
          <ArrowRight data-icon="inline-end" />
        </Button>
      ) : null}
    </div>
  );
}

/** Resolve a lucide icon name from a plugin manifest, falling back to Puzzle. */
function resolveIcon(name: string | undefined): LucideIcon {
  if (name && name in lucideIcons) {
    return lucideIcons[name as keyof typeof lucideIcons];
  }
  return Puzzle;
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

/**
 * Turn a package name into a friendly title: strip the scope and any
 * `(freestyle-)plugin-` prefix, then Title Case the remaining words.
 */
function displayName(plugin: PluginInfo): string {
  const base = plugin.name
    .replace(/^@[^/]+\//, "")
    .replace(/^freestyle-plugin-/, "")
    .replace(/^plugin-/, "");
  return base
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

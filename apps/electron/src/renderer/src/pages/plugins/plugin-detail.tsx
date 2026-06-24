import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Switch } from "@renderer/components/ui/switch";
import type { PluginInfo } from "@shared/plugins";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { pluginDisplayName, resolvePluginIcon } from "./helpers";

export default function PluginDetailPage(): React.JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [plugin, setPlugin] = useState<PluginInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await window.api.refreshPlugins();
      setPlugin(all.find((p) => p.slug === slug) ?? null);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (enabled: boolean): Promise<void> => {
    if (!plugin) return;
    const all = await window.api.setPluginEnabled(plugin.specifier, enabled);
    setPlugin(all.find((p) => p.slug === slug) ?? null);
  };

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
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground -ml-2 mb-5"
          onClick={() => navigate("/plugins")}
        >
          <ArrowLeft data-icon="inline-start" />
          {t("plugins.detail.back")}
        </Button>

        {loading ? (
          <p className="text-muted-foreground text-sm">
            {t("plugins.loading")}
          </p>
        ) : !plugin ? (
          <p className="text-muted-foreground text-sm">
            {t("plugins.detail.notFound")}
          </p>
        ) : (
          <Detail plugin={plugin} onToggle={toggle} />
        )}
      </div>
    </div>
  );
}

function Detail({
  plugin,
  onToggle,
}: {
  plugin: PluginInfo;
  onToggle: (enabled: boolean) => void | Promise<void>;
}): React.JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const Icon = resolvePluginIcon(plugin.icon ?? plugin.pages[0]?.icon);

  return (
    <div>
      <div className="flex items-start gap-5">
        <div className="border-border bg-accent/40 flex size-16 shrink-0 items-center justify-center rounded-[14px] border">
          <Icon className="text-primary size-8" strokeWidth={1.6} />
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="serif text-foreground m-0 text-[32px] leading-none">
            {pluginDisplayName(plugin)}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {plugin.version ? (
              <span className="mono text-muted-foreground text-[11px]">
                v{plugin.version}
              </span>
            ) : null}
            {plugin.author ? (
              <span className="text-muted-foreground text-[12px]">
                {plugin.author}
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
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="text-muted-foreground text-[12px]">
            {plugin.enabled
              ? t("plugins.detail.enabled")
              : t("plugins.detail.disabled")}
          </span>
          <Switch
            checked={plugin.enabled}
            onCheckedChange={(v) => void onToggle(v)}
            aria-label={t("plugins.toggleEnabled")}
          />
        </div>
      </div>

      {plugin.description ? (
        <p className="text-foreground mt-5 max-w-[640px] text-[14px] leading-[1.6]">
          {plugin.description}
        </p>
      ) : null}

      <p className="mono text-muted-foreground mt-6 text-[10px] uppercase tracking-[0.14em]">
        {plugin.specifier}
      </p>

      {plugin.pages.length > 0 ? (
        <section className="mt-7">
          <span className="mono text-muted-foreground text-[10px] uppercase tracking-[0.16em]">
            {t("plugins.detail.pages")}
          </span>
          <div className="mt-3 flex flex-col gap-2">
            {plugin.pages.map((page) => {
              const PageIcon = resolvePluginIcon(page.icon ?? plugin.icon);
              return (
                <button
                  type="button"
                  key={page.id}
                  disabled={!plugin.enabled}
                  onClick={() => navigate(`/plugins/${plugin.slug}/${page.id}`)}
                  className="border-border bg-card hover:border-foreground/15 flex items-center gap-3 rounded-[12px] border p-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PageIcon
                    className="text-muted-foreground size-4 shrink-0"
                    strokeWidth={1.7}
                  />
                  <span className="text-foreground flex-1 text-[14px]">
                    {page.title}
                  </span>
                  <ArrowRight className="text-muted-foreground size-4" />
                </button>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
}

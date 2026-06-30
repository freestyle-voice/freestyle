import { Button } from "@renderer/components/ui/button";
import { Switch } from "@renderer/components/ui/switch";
import type { PluginInfo } from "@shared/plugins";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { pluginDisplayName, resolvePluginIcon } from "./helpers";
import { PluginReadme } from "./plugin-readme";

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
          <p className="text-muted-foreground py-10 text-center text-sm">
            {t("plugins.loading")}
          </p>
        ) : !plugin ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
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
  const page = plugin.pages[0];

  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="border-border bg-secondary flex size-12 shrink-0 items-center justify-center rounded-[12px] border">
          <Icon
            className={
              plugin.enabled
                ? "text-primary size-6"
                : "text-muted-foreground size-6"
            }
            strokeWidth={1.6}
          />
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="serif text-foreground m-0 text-[32px] leading-[1]">
            {pluginDisplayName(plugin)}
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
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
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
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
          <Switch
            checked={plugin.enabled}
            onCheckedChange={(v) => void onToggle(v)}
            aria-label={t(
              plugin.enabled ? "plugins.disablePlugin" : "plugins.enablePlugin",
            )}
          />
        </div>
      </div>

      {plugin.description ? (
        <p className="text-foreground mt-5 max-w-[680px] text-[14px] leading-[1.6]">
          {plugin.description}
        </p>
      ) : null}

      <p className="mono text-muted-foreground mt-4 text-[12px]">
        {plugin.specifier}
      </p>

      <hr className="border-border mt-6" />

      {plugin.readme ? (
        <div className="mt-6">
          <PluginReadme source={plugin.readme} />
        </div>
      ) : (
        <p className="text-muted-foreground mt-6 text-[13px]">
          {t("plugins.detail.noReadme")}
        </p>
      )}
    </div>
  );
}

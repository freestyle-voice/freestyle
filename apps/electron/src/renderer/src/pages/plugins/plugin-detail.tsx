import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@renderer/components/ui/alert-dialog";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Switch } from "@renderer/components/ui/switch";
import type { PluginInfo, PluginUpdateResult } from "@shared/plugins";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router";
import { pluginDisplayName, usePluginUpdates } from "./helpers";
import { PluginReadme } from "./plugin-readme";
import { PluginDetailSkeleton } from "./plugin-skeletons";

const SKIP_UNINSTALL_CONFIRM_KEY = "plugins.skipUninstallConfirm";

export default function PluginDetailPage(): React.JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: allPlugins, isLoading: loading } = useQuery({
    queryKey: ["plugins"],
    queryFn: () => window.api.refreshPlugins(),
  });

  const plugin = allPlugins?.find((p) => p.slug === slug) ?? null;

  const toggle = async (enabled: boolean): Promise<void> => {
    if (!plugin) return;
    const all = await window.api.setPluginEnabled(plugin.specifier, enabled);
    queryClient.setQueryData(["plugins"], all);
  };

  const { data: updatesMap } = usePluginUpdates(plugin ? [plugin] : []);
  const update = plugin ? updatesMap?.get(plugin.specifier) : undefined;

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
        {loading ? (
          <PluginDetailSkeleton />
        ) : !plugin ? (
          <p className="text-muted-foreground py-10 text-center text-sm">
            {t("plugins.detail.notFound")}
          </p>
        ) : (
          <Detail
            plugin={plugin}
            onToggle={toggle}
            onUninstall={async () => {
              await window.api.uninstallPlugin(plugin.specifier);
              navigate("/plugins");
            }}
            update={update}
          />
        )}
      </div>
    </div>
  );
}

function Detail({
  plugin,
  onToggle,
  onUninstall,
  update,
}: {
  plugin: PluginInfo;
  onToggle: (enabled: boolean) => void | Promise<void>;
  onUninstall: () => void | Promise<void>;
  update?: PluginUpdateResult;
}): React.JSX.Element {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const isDev = plugin.slug.endsWith("-dev");
  const [updating, setUpdating] = useState(false);
  const [uninstalling, setUninstalling] = useState(false);

  const doUpdate = async (): Promise<void> => {
    setUpdating(true);
    try {
      const all = await window.api.installPlugin(plugin.specifier);
      queryClient.setQueryData(["plugins"], all);
      void queryClient.invalidateQueries({ queryKey: ["plugin-updates"] });
    } catch {
      // Install errors surface via the server; no UI toast needed here.
    } finally {
      setUpdating(false);
    }
  };

  const doUninstall = async (): Promise<void> => {
    setUninstalling(true);
    try {
      await onUninstall();
    } finally {
      setUninstalling(false);
    }
  };

  return (
    <div>
      <div className="mb-7 flex items-end justify-between gap-4">
        <div>
          <h1 className="serif text-foreground m-0 flex items-baseline gap-3 text-[48px] font-normal leading-[0.95] tracking-[-0.025em]">
            <span>
              <span className="serif-italic text-primary">
                {pluginDisplayName(plugin)}
              </span>
              <span>. </span>
            </span>
            {isDev ? (
              <span className="bg-yellow-500/15 text-yellow-700 dark:text-yellow-300 mono relative -top-[6px] rounded-full border border-yellow-500/30 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.12em]">
                Dev
              </span>
            ) : null}
          </h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {plugin.description ? (
              <p className="text-muted-foreground max-w-[580px] text-[14px] leading-[1.5]">
                {plugin.description}
              </p>
            ) : null}
          </div>
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
            <span className="mono text-muted-foreground/60 text-[11px]">
              {plugin.specifier}
            </span>
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
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          {update?.updateAvailable ? (
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

          <div className="flex items-center gap-2">
            <label
              htmlFor="plugin-enabled-toggle"
              className="text-muted-foreground text-[13px]"
            >
              {t(
                plugin.enabled
                  ? "plugins.detail.enabled"
                  : "plugins.detail.disabled",
              )}
            </label>
            <Switch
              id="plugin-enabled-toggle"
              size="sm"
              checked={plugin.enabled}
              onCheckedChange={(checked) => void onToggle(checked)}
            />
          </div>

          <UninstallButton
            pluginName={pluginDisplayName(plugin)}
            uninstalling={uninstalling}
            onConfirm={() => void doUninstall()}
          />
        </div>
      </div>

      <hr className="border-border" />

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

function UninstallButton({
  pluginName,
  uninstalling,
  onConfirm,
}: {
  pluginName: string;
  uninstalling: boolean;
  onConfirm: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const dontAskRef = useRef(false);

  const shouldSkip = useCallback((): boolean => {
    try {
      return localStorage.getItem(SKIP_UNINSTALL_CONFIRM_KEY) === "true";
    } catch {
      return false;
    }
  }, []);

  const handleClick = (): void => {
    if (shouldSkip()) {
      onConfirm();
    } else {
      dontAskRef.current = false;
      setOpen(true);
    }
  };

  const handleConfirm = (): void => {
    if (dontAskRef.current) {
      try {
        localStorage.setItem(SKIP_UNINSTALL_CONFIRM_KEY, "true");
      } catch {
        // Ignore write failures.
      }
    }
    onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="sm"
        disabled={uninstalling}
        onClick={handleClick}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
      >
        {uninstalling ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Trash2 className="size-3.5" />
        )}
        {t("plugins.uninstall")}
      </Button>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("plugins.uninstallConfirm.title", { name: pluginName })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("plugins.uninstallConfirm.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <label className="flex items-center gap-2 text-[13px] text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            className="accent-primary size-3.5 rounded"
            onChange={(e) => {
              dontAskRef.current = e.target.checked;
            }}
          />
          {t("plugins.uninstallConfirm.dontAskAgain")}
        </label>

        <AlertDialogFooter>
          <AlertDialogCancel>
            {t("plugins.uninstallConfirm.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={handleConfirm}>
            {t("plugins.uninstall")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

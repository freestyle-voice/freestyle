import type {
  CleanupAppAssignment,
  CleanupToneDestination,
} from "@freestyle-voice/validations";
import { RouteMark } from "@renderer/components/tone-previews/app-marks";
import {
  findRouteOwnership,
  getDestinationLabelKey,
} from "@renderer/components/tone-previews/route-ownership";
import { Button } from "@renderer/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@renderer/components/ui/dialog";
import { Input } from "@renderer/components/ui/input";
import { cn } from "@renderer/lib/utils";
import { Globe, Loader2, Plus, RefreshCw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { OpenAppCandidate } from "../../../../shared/open-apps";

// ---------------------------------------------------------------------------
// App assignments — manages custom routes for a tone. Open apps are chosen from
// a best-effort OS-level list, while websites stay explicit and match by host.
// ---------------------------------------------------------------------------

function hostFromUrl(raw: string): string | null {
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

function inputToSiteAssignment(
  raw: string,
  destination: CleanupToneDestination,
): CleanupAppAssignment | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (trimmed.includes("://")) {
    const host = hostFromUrl(trimmed);
    if (host) return { match: host, label: host, kind: "site", destination };
    return null;
  }

  if (/^[^\s]+\.[^\s]+$/.test(trimmed)) {
    const host = trimmed
      .split("/")[0]!
      .replace(/^www\./, "")
      .toLowerCase();
    return { match: host, label: host, kind: "site", destination };
  }

  return null;
}

function ExistingAssignmentRow({
  item,
  onRemove,
}: {
  item: CleanupAppAssignment;
  onRemove: () => void;
}): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="bg-background flex items-center justify-between gap-3 rounded-[12px] border border-border px-3 py-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <RouteMark assignment={item} size={28} />
        <div className="min-w-0">
          <p className="text-foreground truncate text-[13px] font-medium">
            {item.label}
          </p>
          <p className="text-muted-foreground text-[11px] leading-none">
            {item.kind === "site"
              ? t("tone.apps.kindSite")
              : t("tone.apps.kindApp")}
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        onClick={onRemove}
        aria-label={`${t("tone.apps.remove")} ${item.label}`}
      >
        <X />
      </Button>
    </div>
  );
}

export function AppAssignments({
  destination,
  items,
  allItems,
  onAdd,
  onRemove,
  className,
}: {
  destination: CleanupToneDestination;
  items: CleanupAppAssignment[];
  allItems: CleanupAppAssignment[];
  onAdd: (assignment: CleanupAppAssignment) => void;
  onRemove: (match: string) => void;
  className?: string;
}): React.JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [siteValue, setSiteValue] = useState("");
  const [detectedApps, setDetectedApps] = useState<OpenAppCandidate[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);

  const siteAssignment = inputToSiteAssignment(siteValue, destination);

  function getRouteStatus(
    kind: CleanupAppAssignment["kind"],
    match: string,
  ):
    | { type: "available" }
    | { type: "current"; source: "builtin" | "assignment" }
    | { type: "move"; destination: CleanupToneDestination } {
    const ownership = findRouteOwnership(kind, match, allItems);
    if (!ownership) return { type: "available" };
    if (ownership.destination === destination) {
      return { type: "current", source: ownership.source };
    }
    return { type: "move", destination: ownership.destination };
  }

  function routeStatusText(
    status:
      | { type: "available" }
      | { type: "current"; source: "builtin" | "assignment" }
      | { type: "move"; destination: CleanupToneDestination },
  ): string {
    switch (status.type) {
      case "current":
        return status.source === "builtin"
          ? t("tone.apps.includedByDefault")
          : t("tone.apps.currentRoute");
      case "move":
        return t("tone.apps.moveFrom", {
          destination: t(getDestinationLabelKey(status.destination)),
        });
      default:
        return t("tone.apps.pickApp");
    }
  }

  const loadDetectedApps = useCallback(async (): Promise<void> => {
    setLoadingApps(true);
    try {
      const next = (await window.api?.getOpenAppCandidates()) ?? [];
      setDetectedApps(next);
    } catch {
      setDetectedApps([]);
    } finally {
      setLoadingApps(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadDetectedApps();
  }, [open, loadDetectedApps]);

  function closeDialog(): void {
    setOpen(false);
    setSiteValue("");
  }

  function addDetectedApp(candidate: OpenAppCandidate): void {
    onAdd({
      match: candidate.match,
      label: candidate.label,
      kind: "app",
      destination,
    });
    closeDialog();
  }

  function addWebsite(): void {
    if (!siteAssignment) return;
    onAdd(siteAssignment);
    closeDialog();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSiteValue("");
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="default"
          size="icon-sm"
          className={cn("shadow-sm", className)}
          aria-label={t("tone.apps.add")}
        >
          <Plus />
        </Button>
      </DialogTrigger>

      <DialogContent className="grid-rows-[auto_minmax(0,1fr)] max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-[560px]">
        <DialogHeader className="gap-2.5 border-b border-border/70 px-6 py-5 pr-14">
          <DialogTitle>{t("tone.apps.dialogTitle")}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 space-y-5 overflow-y-auto px-6 py-5">
          {items.length > 0 ? (
            <section className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="mono text-muted-foreground text-[10px] uppercase tracking-[0.14em]">
                  {t("tone.apps.currentRoutes")}
                </span>
              </div>
              <div className="space-y-2">
                {items.map((item) => (
                  <ExistingAssignmentRow
                    key={item.match}
                    item={item}
                    onRemove={() => onRemove(item.match)}
                  />
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="mono text-muted-foreground text-[10px] uppercase tracking-[0.14em]">
                {t("tone.apps.openApps")}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void loadDetectedApps()}
                disabled={loadingApps}
                className="shrink-0"
              >
                {loadingApps ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <RefreshCw />
                )}
                {t("tone.apps.refresh")}
              </Button>
            </div>

            {loadingApps ? (
              <div className="text-muted-foreground flex min-h-[84px] items-center justify-center rounded-[14px] border border-dashed border-border bg-background text-[12px]">
                <Loader2 className="mr-2 size-4 animate-spin" />
                {t("tone.apps.loadingOpenApps")}
              </div>
            ) : detectedApps.length > 0 ? (
              <div className="grid max-h-[min(44vh,420px)] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
                {detectedApps.map((candidate) => {
                  const status = getRouteStatus("app", candidate.match);
                  const disabled = status.type === "current";
                  const showHoverAction = status.type === "available";
                  return (
                    <Button
                      key={candidate.match}
                      type="button"
                      variant={disabled ? "secondary" : "outline"}
                      onClick={() => addDetectedApp(candidate)}
                      disabled={disabled}
                      className={cn(
                        "h-auto justify-start gap-2 rounded-[12px] px-3 py-2.5 text-left",
                        showHoverAction ? "items-center" : "items-start",
                      )}
                    >
                      <RouteMark
                        assignment={{
                          match: candidate.match,
                          label: candidate.label,
                          kind: "app",
                          destination,
                        }}
                        size={26}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-foreground block truncate text-[13px] font-medium">
                            {candidate.label}
                          </span>
                          {showHoverAction ? (
                            <span className="text-muted-foreground hidden shrink-0 text-[11px] opacity-0 transition-opacity duration-150 group-hover/button:opacity-100 group-focus-visible/button:opacity-100 sm:block">
                              {t("tone.apps.pickApp")}
                            </span>
                          ) : null}
                        </span>
                        {showHoverAction ? null : (
                          <span className="text-muted-foreground mt-0.5 block text-[11px] leading-none">
                            {routeStatusText(status)}
                          </span>
                        )}
                      </span>
                    </Button>
                  );
                })}
              </div>
            ) : (
              <div className="text-muted-foreground min-h-[84px] rounded-[14px] border border-dashed border-border bg-background px-4 py-4 text-[12px] leading-[1.55]">
                {t("tone.apps.openAppsEmpty")}
              </div>
            )}
          </section>

          <section className="space-y-3 border-t border-border/70 pt-5">
            <div className="flex items-center gap-2">
              <Globe className="text-muted-foreground size-4" />
              <span className="mono text-muted-foreground text-[10px] uppercase tracking-[0.14em]">
                {t("tone.apps.websiteLabel")}
              </span>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                autoFocus={false}
                value={siteValue}
                onChange={(event) => setSiteValue(event.target.value)}
                onKeyDown={(event) => {
                  const status = siteAssignment
                    ? getRouteStatus("site", siteAssignment.match)
                    : { type: "available" as const };
                  if (
                    event.key === "Enter" &&
                    siteAssignment &&
                    status.type !== "current"
                  ) {
                    addWebsite();
                  }
                }}
                placeholder={t("tone.apps.websitePlaceholder")}
                className="h-9 flex-1"
                aria-label={t("tone.apps.websiteLabel")}
              />
              <Button
                type="button"
                variant="ink"
                className="h-9"
                onClick={addWebsite}
                disabled={
                  !siteAssignment ||
                  getRouteStatus("site", siteAssignment.match).type ===
                    "current"
                }
              >
                {t("tone.apps.addWebsite")}
              </Button>
            </div>

            {siteAssignment ? (
              <div className="bg-background flex items-center gap-2.5 rounded-[12px] border border-border px-3 py-2">
                <RouteMark assignment={siteAssignment} size={28} />
                <div className="min-w-0">
                  <p className="text-foreground truncate text-[13px] font-medium">
                    {siteAssignment.label}
                  </p>
                  <p className="text-muted-foreground text-[11px] leading-none">
                    {(() => {
                      const status = getRouteStatus(
                        "site",
                        siteAssignment.match,
                      );
                      if (status.type === "available") {
                        return t("tone.apps.matchByDomain");
                      }
                      return routeStatusText(status);
                    })()}
                  </p>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { capture, captureSuggestion } from "@renderer/lib/analytics";
import { apiFetch } from "@renderer/lib/api";
import { applyOpenerTemplate } from "@renderer/lib/openers";
import { ONE_HOUR, queryKeys } from "@renderer/lib/query";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Brain,
  Check,
  Code2,
  FilePenLine,
  ListChecks,
  Lock,
  type LucideIcon,
  Search,
  Sparkles,
} from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";

interface CapabilityItem {
  id: string;
  title: string;
  subtitle: string;
  prompt?: string;
  templateId?: string;
  toolkitSlug?: string;
  locked?: boolean;
}

interface CapabilityGroup {
  id: string;
  title: string;
  blurb: string;
  items: CapabilityItem[];
}

async function fetchCapabilityGroups(): Promise<CapabilityGroup[]> {
  const res = await apiFetch("/api/suggestions/capabilities");
  if (!res.ok) throw new Error(`capabilities fetch failed: ${res.status}`);
  const payload = (await res.json()) as { groups?: unknown };
  if (!Array.isArray(payload.groups)) {
    throw new Error("capabilities response did not include groups");
  }
  return payload.groups as CapabilityGroup[];
}

function capabilityIcon(item: CapabilityItem, groupId: string): LucideIcon {
  const terms = `${groupId} ${item.id} ${item.title}`.toLowerCase();
  if (item.locked) return Lock;
  if (/(code|repo|engineer|debug)/.test(terms)) return Code2;
  if (/(research|look.?up|search)/.test(terms)) return Search;
  if (/(brain|remember|learn)/.test(terms)) return Brain;
  if (/(task|list|procedure)/.test(terms)) return ListChecks;
  if (/(draft|reply|message|email|write)/.test(terms)) return FilePenLine;
  return Sparkles;
}

function CapabilityGlyph({
  item,
  groupId,
}: {
  item: CapabilityItem;
  groupId: string;
}): React.JSX.Element {
  const Icon = capabilityIcon(item, groupId);
  return (
    <span className="tavern-cap-glyph" aria-hidden="true">
      <Icon />
    </span>
  );
}

function CapabilitiesLoadingSkeleton(): React.JSX.Element {
  return (
    <div
      className="tavern-cap-loading"
      role="status"
      aria-label="Loading shortcuts"
    >
      {[
        ["first", "second", "third"],
        ["fourth", "fifth"],
      ].map((items, groupIndex) => (
        <div key={groupIndex} className="tavern-cap-group">
          <div className="tavern-cap-head" aria-hidden="true">
            <span className="tavern-cap-skeleton-line is-title" />
            <span className="tavern-cap-skeleton-line is-blurb" />
          </div>
          <div className="tavern-cap-grid" aria-hidden="true">
            {items.map((item) => (
              <div key={item} className="tavern-cap tavern-cap-skeleton">
                <span className="tavern-cap-glyph" />
                <span className="tavern-cap-copy">
                  <i className="tavern-cap-skeleton-line is-item-title" />
                  <i className="tavern-cap-skeleton-line is-item-subtitle" />
                </span>
                <span className="tavern-cap-action" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Capabilities({
  onPrompt,
  onOpenApps,
}: {
  onPrompt: (text: string) => void;
  onOpenApps: () => void;
}): React.JSX.Element {
  const capabilitiesQuery = useQuery({
    queryKey: queryKeys.capabilities,
    queryFn: fetchCapabilityGroups,
    staleTime: ONE_HOUR,
  });
  const [applied, setApplied] = useState<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());
  const groups = capabilitiesQuery.data ?? [];

  useEffect(() => {
    if (!capabilitiesQuery.data) return;
    capture("capabilities_opened", {
      groups: capabilitiesQuery.data.map((group) => group.id),
      items: capabilitiesQuery.data.reduce(
        (total, group) => total + group.items.length,
        0,
      ),
    });
  }, [capabilitiesQuery.data]);

  if (capabilitiesQuery.isError)
    return (
      <div className="tavern-empty" role="alert">
        <p>Couldn&apos;t load the available shortcuts.</p>
        <button
          type="button"
          className="tavern-retry"
          onClick={() => void capabilitiesQuery.refetch()}
        >
          Try again
        </button>
      </div>
    );
  if (capabilitiesQuery.isLoading)
    return (
      <>
        <p className="tavern-set-hint is-lead">
          Everything Freestyle can do for you. Tap one to run it.
        </p>
        <CapabilitiesLoadingSkeleton />
      </>
    );
  if (groups.length === 0)
    return <div className="tavern-empty">No shortcuts are available yet.</div>;

  const run = (item: CapabilityItem): void => {
    captureSuggestion("accepted", "capability", { id: item.id });
    if (item.locked && item.toolkitSlug) {
      onOpenApps();
      return;
    }
    if (item.templateId) {
      const templateId = item.templateId;
      setFailed((prev) => {
        const next = new Set(prev);
        next.delete(templateId);
        return next;
      });
      void applyOpenerTemplate(templateId)
        .then((result) => {
          const done =
            result.applied.length > 0 ||
            result.skipped.some((entry) => entry.reason === "exists");
          if (!done) throw new Error("template-not-applied");
          setApplied((prev) => new Set(prev).add(templateId));
          capture("automation_applied", { surface: "capability", templateId });
        })
        .catch(() => {
          setFailed((prev) => new Set(prev).add(templateId));
        });
      return;
    }
    if (item.prompt) onPrompt(item.prompt);
  };

  return (
    <>
      <p className="tavern-set-hint is-lead">
        Everything Freestyle can do for you. Tap one to run it.
      </p>
      {groups.map((group) => (
        <div key={group.id} className="tavern-cap-group">
          <div className="tavern-cap-head">
            <span className="tavern-cap-title">{group.title}</span>
            <span className="tavern-cap-blurb">{group.blurb}</span>
          </div>
          <div className="tavern-cap-grid">
            {group.items.map((item) => {
              const isApplied = Boolean(
                item.templateId && applied.has(item.templateId),
              );
              const hasFailed = Boolean(
                item.templateId && failed.has(item.templateId),
              );
              const action = item.locked
                ? "Connect"
                : hasFailed
                  ? "Retry"
                  : isApplied
                    ? "Ready"
                    : "Run";

              return (
                <button
                  key={item.id}
                  type="button"
                  className={`tavern-cap${item.locked ? " is-locked" : ""}${isApplied ? " is-applied" : ""}${hasFailed ? " is-failed" : ""}`}
                  onClick={() => run(item)}
                >
                  <CapabilityGlyph item={item} groupId={group.id} />
                  <span className="tavern-cap-copy">
                    <span className="tavern-cap-item-title">{item.title}</span>
                    <span className="tavern-cap-item-sub">{item.subtitle}</span>
                  </span>
                  <span className="tavern-cap-action">
                    {isApplied ? (
                      <Check aria-hidden="true" />
                    ) : (
                      <ArrowUpRight aria-hidden="true" />
                    )}
                    {action}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

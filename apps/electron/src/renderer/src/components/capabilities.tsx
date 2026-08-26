import { capture, captureSuggestion } from "@renderer/lib/analytics";
import { apiFetch } from "@renderer/lib/api";
import { applyOpenerTemplate } from "@renderer/lib/openers";
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

export function Capabilities({
  onPrompt,
  onOpenApps,
}: {
  onPrompt: (text: string) => void;
  onOpenApps: () => void;
}): React.JSX.Element {
  const [groups, setGroups] = useState<CapabilityGroup[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [applied, setApplied] = useState<ReadonlySet<string>>(new Set());
  const [failed, setFailed] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    if (loadAttempt > 0) setLoadFailed(false);
    void (async () => {
      try {
        const res = await apiFetch("/api/suggestions/capabilities");
        if (!res.ok)
          throw new Error(`capabilities fetch failed: ${res.status}`);
        const payload = (await res.json()) as { groups?: unknown };
        if (!Array.isArray(payload.groups)) {
          throw new Error("capabilities response did not include groups");
        }
        if (cancelled) return;
        const next = payload.groups as CapabilityGroup[];
        if (cancelled) return;
        setGroups(next);
        setLoadFailed(false);
        capture("capabilities_opened", {
          groups: next.map((group) => group.id),
          items: next.reduce((total, group) => total + group.items.length, 0),
        });
      } catch {
        if (cancelled) return;
        setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  if (loadFailed)
    return (
      <div className="tavern-empty" role="alert">
        <p>Couldn&apos;t load the available shortcuts.</p>
        <button
          type="button"
          className="tavern-retry"
          onClick={() => {
            setGroups(null);
            setLoadFailed(false);
            setLoadAttempt((attempt) => attempt + 1);
          }}
        >
          Try again
        </button>
      </div>
    );
  if (groups === null) return <div className="tavern-empty">Loading…</div>;
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
          {group.items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`tavern-cap${item.locked ? " is-locked" : ""}`}
              onClick={() => run(item)}
            >
              <span className="tavern-cap-item-title">
                {item.title}
                {item.templateId && applied.has(item.templateId) ? " ✓" : ""}
                {item.templateId && failed.has(item.templateId)
                  ? " · couldn't set up, tap to retry"
                  : ""}
              </span>
              <span className="tavern-cap-item-sub">{item.subtitle}</span>
            </button>
          ))}
        </div>
      ))}
    </>
  );
}

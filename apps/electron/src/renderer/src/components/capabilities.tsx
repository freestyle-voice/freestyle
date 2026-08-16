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
  const [applied, setApplied] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void apiFetch("/api/suggestions/capabilities")
      .then(async (res) =>
        res.ok
          ? ((await res.json()) as { groups: CapabilityGroup[] }).groups
          : [],
      )
      .catch(() => [])
      .then((next) => {
        if (cancelled) return;
        setGroups(next);
        capture("capabilities_opened", {
          groups: next.map((group) => group.id),
          items: next.reduce((total, group) => total + group.items.length, 0),
        });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (groups === null) return <div className="tavern-empty">Loading…</div>;
  if (groups.length === 0)
    return (
      <div className="tavern-empty">
        Couldn't load this right now. Ask in chat instead.
      </div>
    );

  const run = (item: CapabilityItem): void => {
    captureSuggestion("accepted", "capability", { id: item.id });
    if (item.locked && item.toolkitSlug) {
      onOpenApps();
      return;
    }
    if (item.templateId) {
      const templateId = item.templateId;
      setApplied((prev) => new Set(prev).add(templateId));
      capture("automation_applied", { surface: "capability", templateId });
      void applyOpenerTemplate(templateId).catch(() => {});
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
              </span>
              <span className="tavern-cap-item-sub">{item.subtitle}</span>
            </button>
          ))}
        </div>
      ))}
    </>
  );
}

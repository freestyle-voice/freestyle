import { type StepAction, stepActions } from "@freestyle/validations";
import {
  comboDisplayKeys,
  formatAcceleratorKeys,
  keyDisplayLabel,
  useHotkeyRecorder,
} from "@renderer/hooks/use-hotkey-recorder";
import { getClient } from "@renderer/lib/api";
import { cn } from "@renderer/lib/utils";
import {
  AppWindow,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clipboard,
  Download,
  GitBranch,
  Globe,
  Keyboard,
  Pencil,
  Plus,
  Replace,
  Search,
  Trash2,
  Upload,
  Wand2,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StepRow {
  id: number;
  shortcut_id: number;
  position: number;
  action: string;
  value: string;
}

interface ShortcutEntry {
  id: number;
  key: string;
  description: string | null;
  usage_count: number;
  steps: StepRow[];
  created_at: string;
  updated_at: string;
}

interface StepData {
  action: StepAction;
  value: string;
}

// ---------------------------------------------------------------------------
// Step action metadata
// ---------------------------------------------------------------------------

const ACTION_META: Record<
  StepAction,
  { label: string; icon: typeof Replace; placeholder: string }
> = {
  replace: {
    label: "Replace",
    icon: Replace,
    placeholder: "Replacement text...",
  },
  open_app: {
    label: "Open App",
    icon: AppWindow,
    placeholder: "Application name...",
  },
  open_url: { label: "Open URL", icon: Globe, placeholder: "https://..." },
  paste_clipboard: {
    label: "Paste Clipboard",
    icon: Clipboard,
    placeholder: "Text to paste (blank = current clipboard)",
  },
  if: {
    label: "If",
    icon: GitBranch,
    placeholder: "Condition expression...",
  },
  transform: {
    label: "Transform",
    icon: Wand2,
    placeholder: "Transformation instruction...",
  },
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ShortcutsPage(): React.JSX.Element {
  const [entries, setEntries] = useState<ShortcutEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  // Add/edit form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [showYamlEditor, setShowYamlEditor] = useState(false);

  // Hotkey
  const [shortcutsHotkey, setShortcutsHotkey] = useState<string>("");
  const [shortcutsMode, setShortcutsMode] = useState<"hold" | "toggle">("hold");

  const [triggerPhrase, setTriggerPhrase] = useState("");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<StepData[]>([
    { action: "replace", value: "" },
  ]);

  // Load data
  const loadData = useCallback(async () => {
    try {
      const query: Record<string, string> = {
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        orderBy: "-created_at",
      };
      if (search) query.search = search;

      const res = await getClient().api.shortcuts.$get({ query });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.items as unknown as ShortcutEntry[]);
        setTotal(data.total);
      }
    } catch (err) {
      console.error("Failed to load shortcuts:", err);
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load hotkey settings
  useEffect(() => {
    getClient()
      .api.settings[":key"].$get({ param: { key: "shortcuts_hotkey" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.value) setShortcutsHotkey(data.value);
      })
      .catch(() => {});
    getClient()
      .api.settings[":key"].$get({ param: { key: "shortcuts_hotkey_mode" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.value === "toggle") setShortcutsMode("toggle");
      })
      .catch(() => {});
  }, []);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
    setTriggerPhrase("");
    setDescription("");
    setSteps([{ action: "replace", value: "" }]);
    setShowYamlEditor(false);
  }, []);

  const startEdit = useCallback((entry: ShortcutEntry) => {
    setEditingId(entry.id);
    setFormError(null);
    const s = entry.steps.map((st) => ({
      action: st.action as StepAction,
      value: st.value,
    }));
    setSteps(s.length > 0 ? s : [{ action: "replace" as const, value: "" }]);
    setTriggerPhrase(entry.key);
    setDescription(entry.description ?? "");
    setShowForm(true);
  }, []);

  const saveEntry = useCallback(async () => {
    if (!triggerPhrase.trim()) {
      setFormError("Trigger phrase is required");
      return;
    }
    if (steps.length === 0) {
      setFormError("At least one step is required");
      return;
    }
    setFormError(null);

    try {
      const client = getClient();
      const payload = {
        key: triggerPhrase,
        description: description || undefined,
        steps: steps.map((s) => ({ action: s.action, value: s.value })),
      };
      const res = editingId
        ? await client.api.shortcuts[":id"].$put({
            param: { id: String(editingId) },
            json: payload,
          })
        : await client.api.shortcuts.$post({ json: payload });

      if (!res.ok) {
        const err = await res.text().catch(() => "");
        setFormError(err || `HTTP ${res.status}`);
        return;
      }

      resetForm();
      loadData();
    } catch {
      setFormError("Failed to save shortcut.");
    }
  }, [triggerPhrase, description, steps, editingId, resetForm, loadData]);

  const deleteEntry = useCallback(
    async (id: number) => {
      await getClient().api.shortcuts[":id"].$delete({
        param: { id: String(id) },
      });
      loadData();
    },
    [loadData],
  );

  const importRef = useRef<HTMLInputElement>(null);

  const exportJson = useCallback(async () => {
    try {
      const res = await getClient().api.shortcuts["export"].json.$get();
      if (!res.ok) return;
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "shortcuts.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore
    }
  }, []);

  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await getClient().api.shortcuts.import.$post({ json: data });
        loadData();
      } catch {
        // ignore
      }
      if (importRef.current) importRef.current.value = "";
    },
    [loadData],
  );

  // Hotkey recording
  const handleHotkeyRecorded = useCallback((accelerator: string) => {
    setShortcutsHotkey(accelerator);
    window.api?.updateShortcutsHotkey(accelerator);
    getClient()
      .api.settings[":key"].$put({
        param: { key: "shortcuts_hotkey" },
        json: { value: accelerator },
      })
      .catch(() => {});
  }, []);

  const {
    state: recorderState,
    liveModifiers,
    capturedCombo,
    canSaveRecording,
    needsModifierOrMouseButton: needsModOrMouse,
    invalidReleaseNotice,
    startRecording: startHotkeyRecording,
    cancelRecording: cancelHotkeyRecording,
  } = useHotkeyRecorder(handleHotkeyRecorded);

  const handleModeChange = useCallback((mode: "hold" | "toggle") => {
    setShortcutsMode(mode);
    window.api?.setShortcutsHotkeyMode(mode);
    getClient()
      .api.settings[":key"].$put({
        param: { key: "shortcuts_hotkey_mode" },
        json: { value: mode },
      })
      .catch(() => {});
  }, []);

  // Step management
  const addStep = useCallback(() => {
    setSteps((s) => [...s, { action: "replace", value: "" }]);
  }, []);

  const removeStep = useCallback((idx: number) => {
    setSteps((s) => s.filter((_, i) => i !== idx));
  }, []);

  const moveStep = useCallback((idx: number, dir: -1 | 1) => {
    setSteps((s) => {
      const arr = [...s];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return s;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr;
    });
  }, []);

  const updateStep = useCallback(
    (idx: number, patch: Partial<{ action: StepAction; value: string }>) => {
      setSteps((s) =>
        s.map((step, i) => (i === idx ? { ...step, ...patch } : step)),
      );
    },
    [],
  );

  // YAML toggle
  const stepsToYaml = useCallback(
    (steps: { action: string; value: string }[]): string =>
      steps
        .map(
          (s) => `- action: ${s.action}\n  value: ${JSON.stringify(s.value)}`,
        )
        .join("\n"),
    [],
  );

  const yamlToSteps = useCallback(
    (yaml: string): { action: StepAction; value: string }[] | null => {
      try {
        const lines = yaml.split("\n");
        const steps: { action: StepAction; value: string }[] = [];
        let current: { action: string; value: string } | null = null;
        for (const line of lines) {
          const actionMatch = line.match(/^-\s*action:\s*(.+)/);
          if (actionMatch) {
            if (current)
              steps.push(current as { action: StepAction; value: string });
            current = { action: actionMatch[1].trim(), value: "" };
            continue;
          }
          const valueMatch = line.match(/^\s+value:\s*(.*)/);
          if (valueMatch && current) {
            let val = valueMatch[1].trim();
            if (
              (val.startsWith('"') && val.endsWith('"')) ||
              (val.startsWith("'") && val.endsWith("'"))
            ) {
              try {
                val = JSON.parse(val);
              } catch {
                val = val.slice(1, -1);
              }
            }
            current.value = val;
          }
        }
        if (current)
          steps.push(current as { action: StepAction; value: string });
        if (
          steps.length === 0 ||
          steps.some(
            (s) => !(stepActions as readonly string[]).includes(s.action),
          )
        )
          return null;
        return steps;
      } catch {
        return null;
      }
    },
    [],
  );

  const [yamlText, setYamlText] = useState("");
  useEffect(() => {
    if (showYamlEditor) setYamlText(stepsToYaml(steps));
  }, [showYamlEditor, steps, stepsToYaml]);

  const applyYaml = useCallback(() => {
    const parsed = yamlToSteps(yamlText);
    if (parsed) {
      setSteps(parsed);
      setShowYamlEditor(false);
    }
  }, [yamlText, yamlToSteps]);

  // Variable pills from trigger phrase
  const variables =
    triggerPhrase.match(/\{(\w+)\}/g)?.map((v) => v.slice(1, -1)) ?? [];

  // Recorder display
  const liveKeys = liveModifiers.map(keyDisplayLabel);
  const draftKeys = capturedCombo ? comboDisplayKeys(capturedCombo) : liveKeys;
  const captureHint = needsModOrMouse
    ? "Add a modifier or side mouse button"
    : canSaveRecording
      ? "Release to save"
      : "Press a modifier or side mouse button...";

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-sm">Loading shortcuts...</p>
      </div>
    );
  }

  const isEmpty = total === 0 && !search;

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <div className="h-9 shrink-0" />
      <div
        className="responsive-page-scroll flex-1 overflow-auto"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <PageHeader
          title="Shortcuts"
          subtitle="Voice-triggered workflows. Say a phrase to run one or more actions."
        />

        {/* Hotkey configuration */}
        <Section label="Hotkey">
          <Row
            label="Shortcuts hotkey"
            desc={
              shortcutsMode === "toggle"
                ? "Press once to start, again to stop."
                : "Hold to record, release to transcribe."
            }
          >
            {recorderState === "idle" ? (
              <div className="relative inline-flex">
                <button
                  type="button"
                  onClick={startHotkeyRecording}
                  className="border-border hover:bg-secondary inline-flex max-w-full flex-wrap items-center gap-3 rounded-lg border px-3.5 py-2 transition-colors"
                >
                  <Keyboard className="text-muted-foreground h-4 w-4 shrink-0" />
                  {shortcutsHotkey ? (
                    <KeyComboDisplay
                      keys={formatAcceleratorKeys(shortcutsHotkey)}
                    />
                  ) : (
                    <span className="text-muted-foreground text-sm">
                      Not set
                    </span>
                  )}
                  <span className="text-muted-foreground ml-1 text-xs">
                    Change
                  </span>
                </button>
                {invalidReleaseNotice && (
                  <div className="bg-popover text-popover-foreground border-border shadow-soft absolute top-[calc(100%+6px)] right-0 z-20 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs">
                    Hotkeys need a modifier or side mouse button
                  </div>
                )}
              </div>
            ) : (
              <div className="border-primary/60 bg-primary/5 relative inline-flex max-w-full flex-wrap items-center gap-3 rounded-lg border px-3.5 py-2">
                <Keyboard className="text-primary h-4 w-4 shrink-0" />
                {draftKeys.length > 0 ? (
                  <>
                    <KeyComboDisplay keys={draftKeys} variant="dim" />
                    <span className="text-muted-foreground text-xs">
                      {captureHint}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground animate-pulse text-sm">
                    {captureHint}
                  </span>
                )}
                <button
                  type="button"
                  onClick={cancelHotkeyRecording}
                  className="border-border hover:bg-secondary ml-1 rounded-md border px-2.5 py-1 text-xs"
                >
                  Cancel
                </button>
              </div>
            )}
          </Row>
          <Row
            label="Activation"
            desc={
              shortcutsMode === "toggle"
                ? "Press once to start, again to stop."
                : "Push-to-talk while held."
            }
            last
          >
            <div className="border-border bg-card inline-flex w-fit shrink-0 rounded-lg border p-0.5 text-sm">
              <button
                type="button"
                onClick={() => handleModeChange("hold")}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-colors",
                  shortcutsMode === "hold"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Hold
              </button>
              <button
                type="button"
                onClick={() => handleModeChange("toggle")}
                className={cn(
                  "rounded-md px-3 py-1.5 transition-colors",
                  shortcutsMode === "toggle"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Toggle
              </button>
            </div>
          </Row>
        </Section>

        {/* Built-in actions */}
        <Section label="Built-in Actions">
          <div className="grid gap-3 sm:grid-cols-3">
            <ActionCard
              icon={AppWindow}
              label="Open App"
              desc="Launch a desktop application by name."
            />
            <ActionCard
              icon={Globe}
              label="Open URL"
              desc="Open a link in the default browser."
            />
            <ActionCard
              icon={Clipboard}
              label="Paste Clipboard"
              desc="Type clipboard contents into the focused app."
            />
          </div>
        </Section>

        {/* Custom shortcuts */}
        <div className="mt-8">
          <h2 className="mono text-muted-foreground mb-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
            Custom Shortcuts
          </h2>

          {isEmpty && !showForm ? (
            <EmptyState
              onAdd={() => {
                resetForm();
                setShowForm(true);
              }}
            />
          ) : (
            <>
              {/* Search + Actions */}
              <div className="mb-5 mt-3 flex flex-col items-start gap-2.5 min-[1080px]:flex-row min-[1080px]:items-center">
                <div className="border-border bg-card flex min-w-0 flex-1 items-center gap-2 self-stretch rounded-lg border px-3 py-2">
                  <Search className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(0);
                    }}
                    placeholder="Search shortcuts..."
                    className="placeholder:text-muted-foreground/80 text-foreground flex-1 bg-transparent text-[13px] outline-none"
                  />
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2.5">
                  <ToolbarButton onClick={exportJson} title="Export as JSON">
                    <Download size={13} />
                    Export
                  </ToolbarButton>
                  <ToolbarButton
                    onClick={() => importRef.current?.click()}
                    title="Import from JSON"
                  >
                    <Upload size={13} />
                    Import
                  </ToolbarButton>
                  <input
                    ref={importRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={handleImport}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      resetForm();
                      setShowForm(true);
                    }}
                    className="bg-primary text-primary-foreground hover:bg-primary/90 flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-3 py-2 text-[12.5px] font-medium"
                  >
                    <Plus size={13} />
                    Add shortcut
                  </button>
                </div>
              </div>

              {/* Add/Edit form */}
              {showForm && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveEntry();
                  }}
                  className="border-border bg-card mb-6 rounded-[12px] border px-[18px] py-4"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <span className="mono text-muted-foreground text-[10px] uppercase tracking-[0.16em]">
                      {editingId ? "Edit shortcut" : "New shortcut"}
                    </span>
                    <button
                      type="button"
                      onClick={resetForm}
                      className="text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                    <FormField label="Trigger phrase">
                      <input
                        type="text"
                        value={triggerPhrase}
                        onChange={(e) => setTriggerPhrase(e.target.value)}
                        placeholder='e.g. "open slack" or "paste {item}"'
                        className="border-border bg-background w-full rounded-[7px] border px-[11px] py-2 text-[13px] outline-none"
                      />
                      {variables.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {variables.map((v) => (
                            <span
                              key={v}
                              className="bg-accent text-accent-foreground rounded-full px-2 py-0.5 text-[10px] font-medium"
                            >
                              {`{${v}}`}
                            </span>
                          ))}
                        </div>
                      )}
                    </FormField>
                    <FormField label="Description (optional)">
                      <input
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="What does this shortcut do?"
                        className="border-border bg-background w-full rounded-[7px] border px-[11px] py-2 text-[13px] outline-none"
                      />
                    </FormField>
                  </div>

                  {/* Steps */}
                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="mono text-muted-foreground text-[10px] uppercase tracking-[0.16em]">
                        Steps
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setShowYamlEditor(!showYamlEditor)}
                          className="text-muted-foreground hover:text-foreground text-[10px] uppercase tracking-wider"
                        >
                          {showYamlEditor ? "Visual" : "YAML"}
                        </button>
                      </div>
                    </div>

                    {showYamlEditor ? (
                      <div>
                        <textarea
                          value={yamlText}
                          onChange={(e) => setYamlText(e.target.value)}
                          rows={Math.max(4, steps.length * 3)}
                          className="border-border bg-background mono w-full resize-y rounded-[7px] border px-[11px] py-2 text-[12px] outline-none"
                        />
                        <button
                          type="button"
                          onClick={applyYaml}
                          className="border-border text-secondary-foreground/80 hover:text-foreground mt-2 cursor-pointer rounded-md border px-3 py-1.5 text-[12.5px] font-medium"
                        >
                          Apply YAML
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {steps.map((step, idx) => {
                          const meta = ACTION_META[step.action];
                          return (
                            <div
                              key={idx}
                              className="border-border bg-background flex items-start gap-2 rounded-lg border px-3 py-2.5"
                            >
                              <div className="flex flex-col gap-1">
                                <button
                                  type="button"
                                  onClick={() => moveStep(idx, -1)}
                                  disabled={idx === 0}
                                  className={cn(
                                    "rounded p-0.5",
                                    idx === 0
                                      ? "text-muted-foreground/30 cursor-not-allowed"
                                      : "text-muted-foreground hover:text-foreground cursor-pointer",
                                  )}
                                >
                                  <ChevronUp size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveStep(idx, 1)}
                                  disabled={idx === steps.length - 1}
                                  className={cn(
                                    "rounded p-0.5",
                                    idx === steps.length - 1
                                      ? "text-muted-foreground/30 cursor-not-allowed"
                                      : "text-muted-foreground hover:text-foreground cursor-pointer",
                                  )}
                                >
                                  <ChevronDown size={12} />
                                </button>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="mono text-muted-foreground text-[10px]">
                                    {idx + 1}
                                  </span>
                                  <select
                                    value={step.action}
                                    onChange={(e) =>
                                      updateStep(idx, {
                                        action: e.target.value as StepAction,
                                      })
                                    }
                                    className="border-border bg-card rounded-md border px-2 py-1 text-[12px] outline-none"
                                  >
                                    {stepActions.map((a) => (
                                      <option key={a} value={a}>
                                        {ACTION_META[a].label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <input
                                  type="text"
                                  value={step.value}
                                  onChange={(e) =>
                                    updateStep(idx, { value: e.target.value })
                                  }
                                  placeholder={meta.placeholder}
                                  className="mt-1.5 w-full bg-transparent text-[13px] outline-none"
                                />
                                {variables.length > 0 && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {variables.map((v) => (
                                      <button
                                        key={v}
                                        type="button"
                                        onClick={() =>
                                          updateStep(idx, {
                                            value: step.value + `{${v}}`,
                                          })
                                        }
                                        className="bg-accent/60 text-accent-foreground hover:bg-accent cursor-pointer rounded-full px-1.5 py-0.5 text-[9px]"
                                      >
                                        +{`{${v}}`}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              {steps.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeStep(idx)}
                                  className="text-muted-foreground hover:text-destructive cursor-pointer rounded p-1"
                                >
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          );
                        })}
                        <button
                          type="button"
                          onClick={addStep}
                          className="border-border text-muted-foreground hover:text-foreground flex cursor-pointer items-center gap-1.5 self-start rounded-md border border-dashed px-2.5 py-1.5 text-[12px]"
                        >
                          <Plus size={12} />
                          Add step
                        </button>
                      </div>
                    )}
                  </div>

                  {formError && (
                    <p className="text-destructive mt-3 text-xs">{formError}</p>
                  )}
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      onClick={resetForm}
                      className="border-border text-secondary-foreground/80 hover:text-foreground cursor-pointer rounded-md border px-3 py-1.5 text-[12.5px] font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-primary text-primary-foreground hover:bg-primary/90 cursor-pointer rounded-md px-3 py-1.5 text-[12.5px] font-medium"
                    >
                      {editingId ? "Update" : "Add shortcut"}
                    </button>
                  </div>
                </form>
              )}

              {/* Entries list */}
              {entries.length === 0 ? (
                <NoSearchResults search={search} />
              ) : (
                <div className="border-border bg-card overflow-hidden rounded-[12px] border">
                  {entries.map((entry, i) => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      isLast={i === entries.length - 1}
                      onEdit={startEdit}
                      onDelete={deleteEntry}
                    />
                  ))}
                </div>
              )}

              {/* Footer */}
              {total > 0 && (
                <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2">
                  <span className="mono text-muted-foreground text-[11px] tracking-[0.04em]">
                    {total} {total === 1 ? "shortcut" : "shortcuts"}
                  </span>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={page === 0}
                        className={cn(
                          "rounded p-1",
                          page === 0
                            ? "text-muted-foreground/40 cursor-not-allowed"
                            : "text-muted-foreground hover:text-foreground cursor-pointer",
                        )}
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="mono text-muted-foreground px-2 text-[11px]">
                        {page + 1} / {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setPage((p) => Math.min(totalPages - 1, p + 1))
                        }
                        disabled={page >= totalPages - 1}
                        className={cn(
                          "rounded p-1",
                          page >= totalPages - 1
                            ? "text-muted-foreground/40 cursor-not-allowed"
                            : "text-muted-foreground hover:text-foreground cursor-pointer",
                        )}
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function PageHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}): React.JSX.Element {
  return (
    <div className="mb-7">
      <h1 className="serif text-foreground m-0 text-[48px] font-normal leading-[0.95] tracking-[-0.025em]">
        <span className="serif-italic text-primary">{title}</span>
        <span>. </span>
      </h1>
      {subtitle && (
        <p className="text-muted-foreground mt-2.5 max-w-[580px] text-[14px] leading-[1.5]">
          {subtitle}
        </p>
      )}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="mt-8">
      <h2 className="mono text-muted-foreground mb-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
        {label}
      </h2>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function Row({
  label,
  desc,
  children,
  last,
}: {
  label: string;
  desc: string;
  children: React.ReactNode;
  last?: boolean;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "grid grid-cols-1 items-start gap-3 py-[22px] min-[1080px]:grid-cols-[220px_minmax(0,1fr)] min-[1080px]:gap-8 min-[1280px]:grid-cols-[280px_minmax(0,1fr)] min-[1280px]:gap-9",
        !last && "border-border border-b",
      )}
    >
      <div>
        <div className="text-foreground text-[15px] font-medium">{label}</div>
        <p className="text-muted-foreground mt-0.5 text-[12.5px] leading-[1.5]">
          {desc}
        </p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ActionCard({
  icon: Icon,
  label,
  desc,
}: {
  icon: typeof Replace;
  label: string;
  desc: string;
}): React.JSX.Element {
  return (
    <div className="border-border bg-card rounded-[10px] border px-4 py-3.5">
      <div className="flex items-center gap-2.5">
        <div className="bg-accent inline-flex h-8 w-8 items-center justify-center rounded-lg">
          <Icon className="text-primary h-4 w-4" />
        </div>
        <div>
          <div className="text-foreground text-[13px] font-medium">{label}</div>
          <p className="text-muted-foreground text-[11px] leading-[1.4]">
            {desc}
          </p>
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="border-border text-secondary-foreground/80 hover:text-foreground flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border px-3 py-2 text-[12.5px] font-medium"
    >
      {children}
    </button>
  );
}

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <div className="mono text-muted-foreground mb-1.5 text-[10px] uppercase tracking-[0.16em]">
        {label}
      </div>
      {children}
      {error && <p className="text-destructive mt-1 text-xs">{error}</p>}
    </div>
  );
}

function KeyBadge({
  label,
  variant = "default",
}: {
  label: string;
  variant?: "default" | "recording" | "dim";
}): React.JSX.Element {
  return (
    <kbd
      className={cn(
        "inline-flex select-none items-center justify-center",
        "min-w-[26px] rounded-md px-1.5 py-1",
        "font-mono text-xs font-medium leading-none",
        "border shadow-[0_1px_0_0_hsl(var(--border))]",
        variant === "default" && "border-border bg-muted text-foreground",
        variant === "recording" &&
          "border-primary/40 bg-primary/10 text-primary",
        variant === "dim" &&
          "border-border/50 bg-muted/50 text-muted-foreground",
      )}
    >
      {label}
    </kbd>
  );
}

function KeyComboDisplay({
  keys,
  variant = "default",
}: {
  keys: string[];
  variant?: "default" | "recording" | "dim";
}): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {keys.map((k, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && (
            <span className="text-muted-foreground text-[10px]">+</span>
          )}
          <KeyBadge label={k} variant={variant} />
        </span>
      ))}
    </div>
  );
}

function EntryRow({
  entry,
  isLast,
  onEdit,
  onDelete,
}: {
  entry: ShortcutEntry;
  isLast: boolean;
  onEdit: (entry: ShortcutEntry) => void;
  onDelete: (id: number) => void;
}): React.JSX.Element {
  const stepSummary =
    entry.steps.length > 0
      ? entry.steps
          .map(
            (s) =>
              `${ACTION_META[s.action as StepAction]?.label ?? s.action}${s.value ? `: ${s.value.slice(0, 30)}` : ""}`,
          )
          .join(" -> ")
      : "No steps";

  return (
    <div
      className={cn(
        "shortcut-entry-row group grid items-center gap-3.5 px-5 py-3.5",
        !isLast && "border-border/60 border-b",
      )}
    >
      <span
        className="mono text-foreground border-border bg-background justify-self-start truncate rounded-md border px-2 py-[3px] text-[12.5px] font-medium"
        title={entry.key}
      >
        {entry.key}
      </span>
      <span
        className="text-secondary-foreground line-clamp-2 text-[13px] leading-[1.4]"
        title={stepSummary}
      >
        {stepSummary}
      </span>
      <span className="mono text-muted-foreground text-right text-[11px] max-[900px]:text-left">
        {entry.usage_count > 0 ? `${entry.usage_count}x used` : "\u2014"}
      </span>
      <div className="flex justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 max-[900px]:row-span-2 max-[900px]:opacity-100">
        <button
          type="button"
          onClick={() => onEdit(entry)}
          className="text-muted-foreground hover:text-foreground cursor-pointer rounded p-1"
          title="Edit"
        >
          <Pencil size={13} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(entry.id)}
          className="text-muted-foreground hover:text-destructive cursor-pointer rounded p-1"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }): React.JSX.Element {
  return (
    <div className="border-border bg-card mt-4 rounded-[14px] border border-dashed px-9 py-[52px] text-center">
      <div className="bg-accent mx-auto mb-[18px] inline-flex h-16 w-16 items-center justify-center rounded-2xl">
        <Zap className="text-primary h-7 w-7" />
      </div>
      <h2 className="serif text-foreground m-0 text-[32px] font-medium leading-none">
        No shortcuts yet.
      </h2>
      <p className="text-muted-foreground mx-auto mt-2.5 max-w-[440px] text-[14px] leading-[1.55]">
        Create a trigger phrase like{" "}
        <span className="mono border-border bg-background text-foreground rounded-[5px] border px-[7px] py-[2px] text-[12px]">
          open slack
        </span>{" "}
        and assign one or more actions to run when you say it.
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="bg-primary text-primary-foreground hover:bg-primary/90 mt-[22px] inline-flex cursor-pointer items-center gap-1.5 rounded-md px-3.5 py-2 text-[12.5px] font-medium"
      >
        <Plus size={13} />
        Add your first shortcut
      </button>
    </div>
  );
}

function NoSearchResults({ search }: { search: string }): React.JSX.Element {
  return (
    <div className="text-muted-foreground py-10 text-center">
      <span className="serif-italic text-[20px]">
        {search
          ? `nothing matches "${search}".`
          : "no shortcuts \u2014 add one to start."}
      </span>
    </div>
  );
}

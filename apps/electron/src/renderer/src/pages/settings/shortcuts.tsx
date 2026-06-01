import {
  type CreateShortcutInput,
  createShortcutSchema,
  type ShortcutAction,
  shortcutActions,
} from "@freestyle/validations";
import { zodResolver } from "@hookform/resolvers/zod";
import { getClient } from "@renderer/lib/api";
import { cn } from "@renderer/lib/utils";
import {
  AppWindow,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Download,
  Globe,
  Pencil,
  Plus,
  Replace,
  Search,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

interface ShortcutEntry {
  id: number;
  key: string;
  value: string;
  action: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

const PAGE_SIZE = 20;

const ACTION_LABELS: Record<string, { label: string; icon: typeof Replace }> = {
  replace: { label: "Replace", icon: Replace },
  open_url: { label: "Open URL", icon: Globe },
};

const BUILTIN_ACTIONS = [
  {
    name: "Open App",
    description:
      'Say "open Slack" or "launch Terminal" and the app opens automatically.',
    icon: AppWindow,
  },
  {
    name: "Open URL",
    description:
      'Say "go to github.com" and it opens in your browser. You can also create shortcuts for specific URLs below.',
    icon: Globe,
  },
  {
    name: "Paste Clipboard",
    description:
      'Say "paste clipboard" or "paste what I copied" to paste your clipboard contents.',
    icon: Clipboard,
  },
];

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
  const [selectedAction, setSelectedAction] =
    useState<ShortcutAction>("replace");

  const {
    register,
    handleSubmit,
    reset: resetFormValues,
    setValue,
    formState: { errors: formErrors },
  } = useForm<CreateShortcutInput>({
    resolver: zodResolver(createShortcutSchema),
    defaultValues: { key: "", value: "", action: "replace" },
  });

  const loadData = useCallback(async () => {
    try {
      const query: Record<string, string> = {
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
        orderBy: "-created_at",
      };
      if (search) query.search = search;

      const res = await getClient().api.dictionary.$get({ query });
      if (res.ok) {
        const data = (await res.json()) as unknown as {
          items: ShortcutEntry[];
          total: number;
        };
        setEntries(data.items);
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

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const resetForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
    setSelectedAction("replace");
    resetFormValues({ key: "", value: "", action: "replace" });
  }, [resetFormValues]);

  const startEdit = useCallback(
    (entry: ShortcutEntry) => {
      setEditingId(entry.id);
      setFormError(null);
      const action = (
        shortcutActions.includes(entry.action as ShortcutAction)
          ? entry.action
          : "replace"
      ) as ShortcutAction;
      setSelectedAction(action);
      resetFormValues({ key: entry.key, value: entry.value, action });
    },
    [resetFormValues],
  );

  const saveEntry = useCallback(
    async (data: CreateShortcutInput) => {
      setFormError(null);

      try {
        const client = getClient();
        const payload = { ...data, action: selectedAction };
        const res = editingId
          ? await client.api.dictionary[":id"].$put({
              param: { id: String(editingId) },
              json: payload,
            })
          : await client.api.dictionary.$post({ json: payload });

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
    },
    [editingId, selectedAction, resetForm, loadData],
  );

  const deleteEntry = useCallback(
    async (id: number) => {
      await getClient().api.dictionary[":id"].$delete({
        param: { id: String(id) },
      });
      loadData();
    },
    [loadData],
  );

  const importRef = useRef<HTMLInputElement>(null);

  const exportJson = useCallback(async () => {
    try {
      const res = await getClient().api.dictionary.export.json.$get();
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
        await getClient().api.dictionary.import.$post({ json: data });
        loadData();
      } catch {
        // ignore
      }
      if (importRef.current) importRef.current.value = "";
    },
    [loadData],
  );

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
          subtitle="Voice-triggered actions. Say a phrase and Freestyle replaces text, opens apps, navigates to URLs, and more."
        />

        {/* Built-in actions section */}
        <div className="mb-8">
          <div className="mono text-muted-foreground mb-3 text-[10px] uppercase tracking-[0.16em]">
            Built-in actions
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {BUILTIN_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <div
                  key={action.name}
                  className="border-border bg-card rounded-[10px] border px-4 py-3.5"
                >
                  <div className="mb-1.5 flex items-center gap-2">
                    <Icon className="text-primary h-3.5 w-3.5" />
                    <span className="text-foreground text-[13px] font-medium">
                      {action.name}
                    </span>
                  </div>
                  <p className="text-muted-foreground text-[12px] leading-[1.45]">
                    {action.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Custom shortcuts section */}
        <div className="mono text-muted-foreground mb-3 text-[10px] uppercase tracking-[0.16em]">
          Custom shortcuts
        </div>

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
            <div className="mb-5 flex flex-col items-start gap-2.5 min-[1080px]:flex-row min-[1080px]:items-center">
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
                <span className="mono text-muted-foreground text-[10px]">
                  {"\u2318"} K
                </span>
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
                onSubmit={handleSubmit(saveEntry as never)}
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

                {/* Action type selector */}
                <div className="mb-3.5">
                  <div className="mono text-muted-foreground mb-1.5 text-[10px] uppercase tracking-[0.16em]">
                    Action type
                  </div>
                  <div className="flex gap-2">
                    {shortcutActions.map((action) => {
                      const meta = ACTION_LABELS[action];
                      const Icon = meta?.icon ?? Zap;
                      const isSelected = selectedAction === action;
                      return (
                        <button
                          key={action}
                          type="button"
                          onClick={() => {
                            setSelectedAction(action);
                            setValue("action", action);
                          }}
                          className={cn(
                            "flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                            isSelected
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border text-secondary-foreground/80 hover:text-foreground",
                          )}
                        >
                          <Icon size={13} />
                          {meta?.label ?? action}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
                  <FormField
                    label="Trigger phrase"
                    error={formErrors.key?.message}
                  >
                    <input
                      type="text"
                      {...register("key")}
                      placeholder={
                        selectedAction === "replace"
                          ? 'e.g. "my address"'
                          : 'e.g. "go to github"'
                      }
                      className={cn(
                        "border-border bg-background w-full rounded-[7px] border px-[11px] py-2 text-[13px] outline-none",
                        formErrors.key && "border-destructive",
                      )}
                    />
                  </FormField>
                  <FormField
                    label={
                      selectedAction === "replace"
                        ? "Replacement text"
                        : selectedAction === "open_url"
                          ? "URL"
                          : "Value"
                    }
                    error={formErrors.value?.message}
                  >
                    {selectedAction === "replace" ? (
                      <textarea
                        {...register("value")}
                        placeholder='e.g. "847 Mission Street, Apt 4, SF..."'
                        rows={2}
                        className={cn(
                          "border-border bg-background w-full resize-none rounded-[7px] border px-[11px] py-2 text-[13px] outline-none",
                          formErrors.value && "border-destructive",
                        )}
                      />
                    ) : (
                      <input
                        type="text"
                        {...register("value")}
                        placeholder={
                          selectedAction === "open_url"
                            ? "https://github.com"
                            : ""
                        }
                        className={cn(
                          "border-border bg-background w-full rounded-[7px] border px-[11px] py-2 text-[13px] outline-none",
                          formErrors.value && "border-destructive",
                        )}
                      />
                    )}
                  </FormField>
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

            {/* Footer - count + pagination */}
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

function ActionBadge({ action }: { action: string }): React.JSX.Element {
  const meta = ACTION_LABELS[action];
  const Icon = meta?.icon ?? Zap;
  return (
    <span className="text-muted-foreground flex items-center gap-1 text-[11px]">
      <Icon size={11} />
      {meta?.label ?? action}
    </span>
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
      <span className="text-secondary-foreground line-clamp-2 text-[13px] leading-[1.4]">
        {entry.value}
      </span>
      <ActionBadge action={entry.action} />
      <span className="mono text-muted-foreground text-right text-[11px] max-[900px]:text-left">
        {entry.usage_count > 0 ? `${entry.usage_count}\u00D7 used` : "\u2014"}
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
        Add a phrase like{" "}
        <span className="mono border-border bg-background text-foreground rounded-[5px] border px-[7px] py-[2px] text-[12px]">
          my address
        </span>{" "}
        to replace it with your full address, or{" "}
        <span className="mono border-border bg-background text-foreground rounded-[5px] border px-[7px] py-[2px] text-[12px]">
          go to github
        </span>{" "}
        to open a URL.
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

import type { CreateFormatInput } from "@freestyle/validations";
import { createFormatSchema } from "@freestyle/validations";
import { zodResolver } from "@hookform/resolvers/zod";
import { getClient } from "@renderer/lib/api";
import { cn } from "@renderer/lib/utils";
import { FileText, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";

interface FormatRule {
  id: number;
  app_pattern: string;
  label: string;
  instructions: string;
  is_default: number;
  created_at: string;
  updated_at: string;
}

export default function FormatsPage(): React.JSX.Element {
  const [rules, setRules] = useState<FormatRule[]>([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<CreateFormatInput>({
    resolver: zodResolver(createFormatSchema),
    defaultValues: { label: "", app_pattern: "", instructions: "" },
  });

  const loadData = useCallback(async () => {
    try {
      const res = await getClient().api.formats.$get({
        query: { limit: "200" },
      });
      if (res.ok) {
        const data = await res.json();
        setRules(data.items ?? data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setFormError(null);
    form.reset({ label: "", app_pattern: "", instructions: "" });
  }, [form]);

  const startEdit = useCallback(
    (rule: FormatRule) => {
      setEditingId(rule.id);
      form.reset({
        label: rule.label,
        app_pattern: rule.app_pattern,
        instructions: rule.instructions,
      });
      setFormError(null);
      setShowForm(true);
    },
    [form],
  );

  const saveRule = useCallback(
    async (data: CreateFormatInput) => {
      setFormError(null);

      try {
        const client = getClient();
        const res = editingId
          ? await client.api.formats[":id"].$put({
              param: { id: String(editingId) },
              json: data,
            })
          : await client.api.formats.$post({ json: data });

        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setFormError(text || `HTTP ${res.status}`);
          return;
        }

        resetForm();
        loadData();
      } catch {
        setFormError("Failed to save.");
      }
    },
    [editingId, resetForm, loadData],
  );

  const deleteRule = useCallback(
    async (id: number) => {
      await getClient().api.formats[":id"].$delete({
        param: { id: String(id) },
      });
      loadData();
    },
    [loadData],
  );

  const resetDefaults = useCallback(async () => {
    await getClient().api.formats.reset.$post();
    loadData();
  }, [loadData]);

  const defaultRules = rules.filter((r) => r.is_default === 1);
  const customRules = rules.filter((r) => r.is_default === 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <p className="text-muted-foreground text-sm">Loading formats...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Formats</h1>
        <p className="text-muted-foreground mt-1">
          Define how transcribed text should be formatted based on the app or
          website you're using. When a match is found, the formatting
          instructions are sent to the LLM for context-aware output.
        </p>
      </div>

      {/* Add button */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            form.reset({ label: "", app_pattern: "", instructions: "" });
            setEditingId(null);
            setFormError(null);
            setShowForm(true);
          }}
          className="bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium"
        >
          <Plus size={16} />
          Add Format
        </button>
        {customRules.length > 0 && (
          <button
            type="button"
            onClick={resetDefaults}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs"
          >
            <RotateCcw size={12} />
            Remove custom rules
          </button>
        )}
      </div>

      {/* Add/Edit Form */}
      {showForm && (
        <div className="border-border bg-card rounded-lg border p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium">
              {editingId ? "Edit Format Rule" : "New Format Rule"}
            </h3>
            <button
              type="button"
              onClick={resetForm}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>
          <form className="space-y-3" onSubmit={form.handleSubmit(saveRule)}>
            <div>
              <label
                htmlFor="fmt-label"
                className="text-muted-foreground mb-1 block text-xs"
              >
                Label
              </label>
              <input
                id="fmt-label"
                type="text"
                {...form.register("label")}
                placeholder='e.g. "Email" or "Slack"'
                className={cn(
                  "border-border bg-background w-full rounded-lg border px-3 py-2 text-sm",
                  form.formState.errors.label && "border-destructive",
                )}
              />
              {form.formState.errors.label && (
                <p className="text-destructive mt-1 text-xs">
                  {form.formState.errors.label.message}
                </p>
              )}
            </div>
            <div>
              <label
                htmlFor="fmt-pattern"
                className="text-muted-foreground mb-1 block text-xs"
              >
                App/URL pattern (pipe-separated)
              </label>
              <input
                id="fmt-pattern"
                type="text"
                {...form.register("app_pattern")}
                placeholder="e.g. mail.google.com|outlook|Spark"
                className={cn(
                  "border-border bg-background w-full rounded-lg border px-3 py-2 font-mono text-sm",
                  form.formState.errors.app_pattern && "border-destructive",
                )}
              />
              {form.formState.errors.app_pattern && (
                <p className="text-destructive mt-1 text-xs">
                  {form.formState.errors.app_pattern.message}
                </p>
              )}
              <p className="text-muted-foreground mt-1 text-[10px]">
                Matched against the app name, URL, and page title.
                Case-insensitive.
              </p>
            </div>
            <div>
              <label
                htmlFor="fmt-instructions"
                className="text-muted-foreground mb-1 block text-xs"
              >
                Formatting instructions
              </label>
              <textarea
                id="fmt-instructions"
                {...form.register("instructions")}
                placeholder="Tell the LLM how to format the text..."
                rows={3}
                className={cn(
                  "border-border bg-background w-full resize-none rounded-lg border px-3 py-2 text-sm",
                  form.formState.errors.instructions && "border-destructive",
                )}
              />
              {form.formState.errors.instructions && (
                <p className="text-destructive mt-1 text-xs">
                  {form.formState.errors.instructions.message}
                </p>
              )}
            </div>
            {formError && (
              <p className="text-destructive text-xs">{formError}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="border-border hover:bg-secondary rounded-lg border px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-3 py-1.5 text-sm font-medium"
              >
                {editingId ? "Update" : "Add"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Custom rules */}
      {customRules.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Custom
          </h3>
          <div className="border-border divide-border divide-y rounded-lg border">
            {customRules.map((rule) => (
              <FormatRuleCard
                key={rule.id}
                rule={rule}
                onEdit={startEdit}
                onDelete={deleteRule}
              />
            ))}
          </div>
        </div>
      )}

      {/* Default rules */}
      {defaultRules.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-muted-foreground text-xs font-semibold uppercase tracking-wider">
            Defaults
          </h3>
          <div className="border-border divide-border divide-y rounded-lg border">
            {defaultRules.map((rule) => (
              <FormatRuleCard
                key={rule.id}
                rule={rule}
                onEdit={startEdit}
                onDelete={deleteRule}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FormatRuleCard({
  rule,
  onEdit,
  onDelete,
}: {
  rule: FormatRule;
  onEdit: (rule: FormatRule) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <div className="group flex items-start gap-3 px-4 py-3">
      <FileText className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-sm font-medium">{rule.label}</span>
          <span className="bg-secondary text-muted-foreground truncate rounded px-1.5 py-0.5 font-mono text-[10px]">
            {rule.app_pattern}
          </span>
        </div>
        <p className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
          {rule.instructions}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={() => onEdit(rule)}
          className="text-muted-foreground hover:text-foreground rounded p-1.5"
          title="Edit"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(rule.id)}
          className="text-muted-foreground hover:text-destructive rounded p-1.5"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

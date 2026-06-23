import type { CreateFormatInput } from "@freestyle/validations";
import { createFormatSchema } from "@freestyle/validations";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge } from "@renderer/components/ui/badge";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import { Textarea } from "@renderer/components/ui/textarea";
import { getClient } from "@renderer/lib/api";
import { cn } from "@renderer/lib/utils";
import { FileText, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const [rules, setRules] = useState<FormatRule[]>([]);
  const [loading, setLoading] = useState(true);

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
        setFormError(t("formats.failedToSave"));
      }
    },
    [editingId, resetForm, loadData, t],
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
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-sm">{t("formats.loading")}</p>
      </div>
    );
  }

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
        <PageHeader title={t("formats.title")} />

        {/* Action bar */}
        <div className="mb-5 flex items-center justify-between">
          <Button
            variant="default"
            onClick={() => {
              form.reset({ label: "", app_pattern: "", instructions: "" });
              setEditingId(null);
              setFormError(null);
              setShowForm(true);
            }}
          >
            <Plus data-icon="inline-start" />
            {t("formats.addFormat")}
          </Button>
          {customRules.length > 0 && (
            <Button variant="outline" onClick={resetDefaults}>
              <RotateCcw data-icon="inline-start" />
              {t("formats.resetToDefaults")}
            </Button>
          )}
        </div>

        {/* Add/Edit form */}
        {showForm && (
          <form
            onSubmit={form.handleSubmit(saveRule)}
            className="border-border bg-card mb-6 rounded-[12px] border px-[18px] py-4"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="mono text-muted-foreground text-[10px] uppercase tracking-[0.16em]">
                {editingId ? t("formats.editFormat") : t("formats.newFormat")}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={resetForm}
                aria-label={t("formats.cancel")}
              >
                <X />
              </Button>
            </div>
            <div className="space-y-3.5">
              <FormField
                label={t("formats.labelField")}
                error={form.formState.errors.label?.message}
              >
                <Input
                  type="text"
                  {...form.register("label")}
                  placeholder={t("formats.labelPlaceholder")}
                  aria-invalid={!!form.formState.errors.label}
                />
              </FormField>
              <FormField
                label={t("formats.appPatternField")}
                error={form.formState.errors.app_pattern?.message}
                hint={t("formats.appPatternHint")}
              >
                <Input
                  type="text"
                  {...form.register("app_pattern")}
                  placeholder={t("formats.appPatternPlaceholder")}
                  className="mono"
                  aria-invalid={!!form.formState.errors.app_pattern}
                />
              </FormField>
              <FormField
                label={t("formats.instructionsField")}
                error={form.formState.errors.instructions?.message}
              >
                <Textarea
                  {...form.register("instructions")}
                  placeholder={t("formats.instructionsPlaceholder")}
                  rows={3}
                  className="resize-none"
                  aria-invalid={!!form.formState.errors.instructions}
                />
              </FormField>
              {formError && (
                <p className="text-destructive text-xs">{formError}</p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={resetForm}>
                  {t("formats.cancel")}
                </Button>
                <Button type="submit" variant="default" size="sm">
                  {editingId ? t("formats.update") : t("formats.addFormatBtn")}
                </Button>
              </div>
            </div>
          </form>
        )}

        {/* Custom section */}
        {customRules.length > 0 && (
          <Section label={t("formats.custom")}>
            {customRules.map((rule) => (
              <FormatCard
                key={rule.id}
                rule={rule}
                custom
                onEdit={startEdit}
                onDelete={deleteRule}
              />
            ))}
          </Section>
        )}

        {/* Defaults section */}
        {defaultRules.length > 0 && (
          <Section label={t("formats.defaults")}>
            {defaultRules.map((rule) => (
              <FormatCard
                key={rule.id}
                rule={rule}
                onEdit={startEdit}
                onDelete={deleteRule}
              />
            ))}
          </Section>
        )}

        {rules.length === 0 && !showForm && (
          <div className="text-muted-foreground py-10 text-center">
            <span className="serif-italic text-[20px]">
              {t("formats.empty")}
            </span>
          </div>
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

function FormField({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div>
      <div className="mono text-muted-foreground mb-1.5 text-[10px] uppercase tracking-[0.16em]">
        {label}
      </div>
      {children}
      {error ? (
        <p className="text-destructive mt-1 text-xs">{error}</p>
      ) : hint ? (
        <p className="text-muted-foreground mt-1.5 text-[11px] leading-snug">
          {hint}
        </p>
      ) : null}
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
    <div className="mb-7">
      <div className="mono text-muted-foreground mb-3 text-[10px] uppercase tracking-[0.18em]">
        {label}
      </div>
      <div className="flex flex-col gap-2.5">{children}</div>
    </div>
  );
}

function FormatCard({
  rule,
  custom,
  onEdit,
  onDelete,
}: {
  rule: FormatRule;
  custom?: boolean;
  onEdit: (rule: FormatRule) => void;
  onDelete: (id: number) => void;
}): React.JSX.Element {
  return (
    <div
      className={cn(
        "group bg-card flex gap-4 rounded-[12px] border px-[18px] py-4",
        custom ? "border-primary/60" : "border-border",
      )}
    >
      <div
        className={cn(
          "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border",
          custom
            ? "border-primary/30 bg-accent text-primary"
            : "border-border bg-background text-muted-foreground",
        )}
      >
        <FileText size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-foreground text-[14px] font-medium">
            {rule.label}
          </span>
          {custom && (
            <Badge
              variant="default"
              className="mono text-[9px] tracking-[0.14em]"
            >
              CUSTOM
            </Badge>
          )}
          <span
            className="mono border-border bg-background text-secondary-foreground/90 rounded border px-[7px] py-[2px] text-[10px]"
            title={rule.app_pattern}
          >
            {rule.app_pattern}
          </span>
        </div>
        <p
          className="text-secondary-foreground m-0 max-w-[720px] text-[16px] leading-[1.55]"
          style={{ textWrap: "pretty" as never }}
        >
          “{rule.instructions}”
        </p>
      </div>
      <div className="flex shrink-0 gap-0.5 self-start opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onEdit(rule)}
          title="Edit"
          aria-label="Edit"
        >
          <Pencil />
        </Button>
        {custom && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onDelete(rule.id)}
            className="hover:text-destructive"
            title="Delete"
            aria-label="Delete"
          >
            <Trash2 />
          </Button>
        )}
      </div>
    </div>
  );
}

import {
  type DataSettingsForm,
  dataSettingsFormSchema,
  HISTORY_RETENTION_DAYS_MAX,
  parseRetentionDays,
} from "@freestyle-voice/validations";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@renderer/components/ui/button";
import { Input } from "@renderer/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@renderer/components/ui/select";
import { Switch } from "@renderer/components/ui/switch";
import { getClient } from "@renderer/lib/api";
import { settingsQueryOptions } from "@renderer/lib/query";
import { useQuery } from "@tanstack/react-query";
import { FolderOpen, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { SETTINGS_KEYS } from "../../../../shared/settings-keys";
import { Row, SettingsPanel } from "./components";
import { useSettingsForm } from "./use-settings-form";

export function DataPanel(): React.JSX.Element {
  const { t } = useTranslation();

  const form = useForm<DataSettingsForm>({
    resolver: zodResolver(dataSettingsFormSchema),
    defaultValues: {
      historyPaused: false,
      historyRetention: "never",
      customRetentionDays: "90",
    },
    mode: "onChange",
  });
  const { control, reset, getValues, watch } = form;
  const { persistField, markSeeded } = useSettingsForm(form);

  const historyRetention = watch("historyRetention");

  const settingsQuery = useQuery(settingsQueryOptions());
  const seeded = useRef(false);
  useEffect(() => {
    const s = settingsQuery.data;
    if (!s || seeded.current) return;
    seeded.current = true;

    const next: DataSettingsForm = {
      historyPaused: s[SETTINGS_KEYS.historyPaused] === "true",
      historyRetention: "never",
      customRetentionDays: "90",
    };
    const days = parseRetentionDays(s[SETTINGS_KEYS.historyRetentionDays]);
    if (days !== null) {
      if (days === 7 || days === 30) {
        next.historyRetention = String(days) as "7" | "30";
      } else {
        next.historyRetention = "custom";
        next.customRetentionDays = String(days);
      }
    }
    reset(next);
    markSeeded(next);
  }, [settingsQuery.data, reset, markSeeded]);

  const retentionOptions = useMemo(
    () => [
      { value: "never", label: t("settings.data.autoDeleteNever") },
      { value: "7", label: t("settings.data.autoDelete7") },
      { value: "30", label: t("settings.data.autoDelete30") },
      { value: "custom", label: t("settings.data.autoDeleteCustom") },
    ],
    [t],
  );

  // Both the preset select and the custom-days input write the same server key
  // (history_retention_days); the wire value is derived from the combined form.
  const retentionWire = useCallback((): string => {
    const preset = getValues("historyRetention");
    if (preset === "never") return "";
    if (preset === "custom") return getValues("customRetentionDays");
    return preset;
  }, [getValues]);

  const clearHistory = useCallback(async () => {
    if (!confirm(t("settings.data.clearHistoryConfirm"))) return;
    await getClient().api.history.$delete();
  }, [t]);

  return (
    <SettingsPanel>
      <Row
        label={t("settings.data.pauseHistory")}
        desc={t("settings.data.pauseHistoryDesc")}
      >
        <Controller
          control={control}
          name="historyPaused"
          render={({ field }) => (
            <Switch
              checked={field.value}
              onCheckedChange={(paused) => {
                field.onChange(paused);
                void persistField("historyPaused", {
                  key: SETTINGS_KEYS.historyPaused,
                });
              }}
            />
          )}
        />
      </Row>
      <Row
        label={t("settings.data.autoDelete")}
        desc={t("settings.data.autoDeleteDesc")}
      >
        <div className="flex min-w-0 items-center gap-2">
          <Controller
            control={control}
            name="historyRetention"
            render={({ field }) => (
              <Select
                value={field.value}
                onValueChange={(v) => {
                  const preset = v as DataSettingsForm["historyRetention"];
                  field.onChange(preset);
                  void persistField("historyRetention", {
                    key: SETTINGS_KEYS.historyRetentionDays,
                    serialize: retentionWire,
                    validateFields: ["customRetentionDays"],
                  });
                }}
              >
                <SelectTrigger id="settings-history-retention" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {retentionOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          {historyRetention === "custom" && (
            <Controller
              control={control}
              name="customRetentionDays"
              render={({ field }) => (
                <>
                  <Input
                    inputMode="numeric"
                    value={field.value}
                    onChange={(e) => {
                      const digits = e.target.value
                        .replace(/\D/g, "")
                        .slice(0, 4);
                      const clamped =
                        digits === ""
                          ? ""
                          : String(
                              Math.min(
                                Number(digits),
                                HISTORY_RETENTION_DAYS_MAX,
                              ),
                            );
                      field.onChange(clamped);
                      void persistField("customRetentionDays", {
                        key: SETTINGS_KEYS.historyRetentionDays,
                        serialize: retentionWire,
                        validateFields: ["historyRetention"],
                      });
                    }}
                    className="w-16 text-center"
                    aria-label={t("settings.data.autoDeleteDays")}
                  />
                  <span className="text-muted-foreground text-xs">
                    {t("settings.data.autoDeleteDays")}
                  </span>
                </>
              )}
            />
          )}
        </div>
      </Row>
      <Row
        label={t("settings.data.history")}
        desc={t("settings.data.historyDesc")}
      >
        <Button variant="destructive" size="sm" onClick={clearHistory}>
          <Trash2 data-icon="inline-start" />
          {t("settings.data.clearHistory")}
        </Button>
      </Row>
      <Row
        label={t("settings.data.logs")}
        desc={t("settings.data.logsDesc")}
        last
      >
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void window.api.openLogsFolder();
          }}
        >
          <FolderOpen data-icon="inline-start" />
          {t("settings.data.openLogs")}
        </Button>
      </Row>
    </SettingsPanel>
  );
}

import {
  type DisplaySettingsForm,
  displaySettingsFormSchema,
} from "@freestyle-voice/validations";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { SETTINGS_KEYS } from "../../../../shared/settings-keys";
import { Row, Segment, type SegmentOption, SettingsPanel } from "./components";
import { normalizePillPos, themeOptions } from "./constants";
import { useSettingsForm } from "./use-settings-form";

export function DisplayPanel(): React.JSX.Element {
  const { t } = useTranslation();
  const { theme, setTheme } = useTheme();

  const form = useForm<DisplaySettingsForm>({
    resolver: zodResolver(displaySettingsFormSchema),
    defaultValues: { theme: "system", pillPosition: "bottom-center" },
    mode: "onChange",
  });
  const { control, setValue, getValues, watch } = form;
  const { persistField, markSeeded } = useSettingsForm(form);

  const pillPosition = watch("pillPosition");

  // Theme is owned by next-themes; mirror its current value into the form so
  // the segmented control reflects it. Persisted to the settings table too.
  useEffect(() => {
    if (theme)
      setValue(
        "theme",
        theme === "dark" || theme === "light" ? theme : "system",
      );
  }, [theme, setValue]);

  // Pill position is IPC-backed. Seed from window.api and track live drags.
  const seeded = useRef(false);
  useEffect(() => {
    let removePillPos: (() => void) | undefined;
    window.api
      ?.getPillPosition()
      .then((pos) => {
        const normalized = normalizePillPos(pos);
        setValue("pillPosition", normalized);
        if (!seeded.current) {
          seeded.current = true;
          markSeeded(getValues());
        }
      })
      .catch(() => {});

    removePillPos = window.api?.onPillPositionChanged((pos) => {
      setValue("pillPosition", normalizePillPos(pos));
      markSeeded(getValues());
    });

    return () => removePillPos?.();
  }, [setValue, getValues, markSeeded]);

  const positionOptions = useMemo<SegmentOption[]>(() => {
    const opts: SegmentOption[] = [
      { id: "top-center", label: t("settings.display.positionTopCenter") },
      { id: "top-right", label: t("settings.display.positionTopRight") },
      {
        id: "bottom-center",
        label: t("settings.display.positionBottomCenter"),
      },
      { id: "bottom-right", label: t("settings.display.positionBottomRight") },
    ];
    if (pillPosition === "custom")
      opts.push({ id: "custom", label: t("settings.display.positionCustom") });
    return opts;
  }, [pillPosition, t]);

  return (
    <SettingsPanel>
      <Row
        label={t("settings.display.theme")}
        desc={t("settings.display.themeDesc")}
      >
        <Controller
          control={control}
          name="theme"
          render={({ field }) => (
            <Segment
              options={themeOptions.map((o) => ({
                id: o.value,
                label: t(
                  `settings.display.theme${o.value.charAt(0).toUpperCase()}${o.value.slice(1)}`,
                ),
                icon: o.icon,
              }))}
              active={field.value}
              onSelect={(v) => {
                const next = v === "dark" || v === "light" ? v : "system";
                field.onChange(next);
                setTheme(next);
                void persistField("theme", { key: SETTINGS_KEYS.theme });
              }}
            />
          )}
        />
      </Row>
      <Row
        label={t("settings.display.widgetPosition")}
        desc={t("settings.display.widgetPositionDesc")}
        last
      >
        <Controller
          control={control}
          name="pillPosition"
          render={({ field }) => (
            <Segment
              compact
              wrap
              options={positionOptions}
              active={field.value}
              onSelect={(v) => {
                field.onChange(v);
                void persistField("pillPosition", {
                  ipc: (val) => window.api?.setPillPosition(val),
                });
              }}
            />
          )}
        />
      </Row>
    </SettingsPanel>
  );
}

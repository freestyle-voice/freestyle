import {
  type ApplicationSettingsForm,
  applicationSettingsFormSchema,
} from "@freestyle-voice/validations";
import { zodResolver } from "@hookform/resolvers/zod";
import { LanguageSelector } from "@renderer/components/language-selector";
import { Switch } from "@renderer/components/ui/switch";
import { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Row, SettingsPanel } from "./components";
import { useSettingsForm } from "./use-settings-form";

export function ApplicationPanel(): React.JSX.Element {
  const { t } = useTranslation();

  const form = useForm<ApplicationSettingsForm>({
    resolver: zodResolver(applicationSettingsFormSchema),
    defaultValues: {
      autoUpdate: true,
      launchAtStartup: false,
      showOnLaunch: true,
    },
    mode: "onChange",
  });
  const { control, reset } = form;
  const { persistField, markSeeded } = useSettingsForm(form);

  // These are IPC-backed (not the settings table) — seed from window.api.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    Promise.all([
      window.api?.getAutoUpdate().catch(() => true),
      window.api?.getLaunchAtStartup().catch(() => false),
      window.api?.getShowDashboardOnLaunch().catch(() => true),
    ]).then(([autoUpdate, launchAtStartup, showOnLaunch]) => {
      const next: ApplicationSettingsForm = {
        autoUpdate: autoUpdate ?? true,
        launchAtStartup: launchAtStartup ?? false,
        showOnLaunch: showOnLaunch ?? true,
      };
      reset(next);
      markSeeded(next);
    });
  }, [reset, markSeeded]);

  return (
    <SettingsPanel>
      <Row
        label={t("settings.interfaceLanguage.label")}
        desc={t("settings.interfaceLanguage.desc")}
      >
        <LanguageSelector />
      </Row>
      <Row
        label={t("settings.application.autoUpdate")}
        desc={t("settings.application.autoUpdateDesc")}
      >
        <Controller
          control={control}
          name="autoUpdate"
          render={({ field }) => (
            <Switch
              checked={field.value}
              onCheckedChange={(enabled) => {
                field.onChange(enabled);
                void persistField("autoUpdate", {
                  ipc: (v) => window.api?.setAutoUpdate(v),
                });
              }}
            />
          )}
        />
      </Row>
      <Row
        label={t("settings.application.launchAtStartup")}
        desc={t("settings.application.launchAtStartupDesc")}
      >
        <Controller
          control={control}
          name="launchAtStartup"
          render={({ field }) => (
            <Switch
              checked={field.value}
              onCheckedChange={(enabled) => {
                field.onChange(enabled);
                void persistField("launchAtStartup", {
                  ipc: (v) => window.api?.setLaunchAtStartup(v),
                });
              }}
            />
          )}
        />
      </Row>
      <Row
        label={t("settings.application.showOnLaunch")}
        desc={t("settings.application.showOnLaunchDesc")}
        last
      >
        <Controller
          control={control}
          name="showOnLaunch"
          render={({ field }) => (
            <Switch
              checked={field.value}
              onCheckedChange={(enabled) => {
                field.onChange(enabled);
                void persistField("showOnLaunch", {
                  ipc: (v) => window.api?.setShowDashboardOnLaunch(v),
                });
              }}
            />
          )}
        />
      </Row>
    </SettingsPanel>
  );
}

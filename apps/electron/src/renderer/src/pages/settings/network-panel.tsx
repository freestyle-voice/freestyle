import {
  type NetworkSettingsForm,
  networkSettingsFormSchema,
} from "@freestyle-voice/validations";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@renderer/components/ui/input";
import { settingsQueryOptions } from "@renderer/lib/query";
import { useQuery } from "@tanstack/react-query";
import { Check, Info } from "lucide-react";
import { useEffect, useRef } from "react";
import {
  Controller,
  type ControllerRenderProps,
  useForm,
} from "react-hook-form";
import { useTranslation } from "react-i18next";
import { SETTINGS_KEYS } from "../../../../shared/settings-keys";
import { Row, SettingsPanel } from "./components";
import { useSettingsForm } from "./use-settings-form";

/**
 * Network — enterprise proxy / custom CA configuration. Uses the same zod
 * schema the server enforces per-key, so inline validation here matches
 * exactly what the API will accept. Persists each field on blur.
 */
export function NetworkPanel(): React.JSX.Element {
  const { t } = useTranslation();

  const form = useForm<NetworkSettingsForm>({
    resolver: zodResolver(networkSettingsFormSchema),
    defaultValues: { proxyUrl: "", caCertPath: "" },
    mode: "onBlur",
  });
  const {
    control,
    reset,
    formState: { errors },
  } = form;
  const { persistField, markSeeded, savedField } = useSettingsForm(form);

  // Hydrate from the shared settings cache (deduped with every other
  // ["settings-all"] consumer) instead of two dedicated single-key GETs.
  const { data: settings } = useQuery(settingsQueryOptions());
  const seeded = useRef(false);
  useEffect(() => {
    if (!settings || seeded.current) return;
    seeded.current = true;
    const next: NetworkSettingsForm = {
      proxyUrl: settings[SETTINGS_KEYS.networkProxyUrl] ?? "",
      caCertPath: settings[SETTINGS_KEYS.networkCaCertPath] ?? "",
    };
    reset(next);
    markSeeded(next);
  }, [settings, reset, markSeeded]);

  return (
    <SettingsPanel>
      <p className="text-muted-foreground border-border border-b pb-5 text-[13px] leading-[1.6]">
        {t("settings.network.intro")}
      </p>
      <Row
        label={t("settings.network.proxy")}
        desc={t("settings.network.proxyDesc")}
        stacked
      >
        <Controller
          control={control}
          name="proxyUrl"
          render={({ field }) => (
            <NetworkField
              id="settings-network-proxy"
              field={field}
              placeholder={t("settings.network.proxyPlaceholder")}
              error={
                errors.proxyUrl ? t("settings.network.invalidProxy") : undefined
              }
              saved={savedField === "proxyUrl"}
              savedLabel={t("settings.network.saved")}
              onCommit={() =>
                persistField("proxyUrl", {
                  key: SETTINGS_KEYS.networkProxyUrl,
                  serialize: (v) => v.trim(),
                })
              }
            />
          )}
        />
      </Row>
      <Row
        label={t("settings.network.caCert")}
        desc={t("settings.network.caCertDesc")}
        stacked
        last
      >
        <Controller
          control={control}
          name="caCertPath"
          render={({ field }) => (
            <NetworkField
              id="settings-network-ca-cert"
              field={field}
              placeholder={t("settings.network.caCertPlaceholder")}
              error={
                errors.caCertPath
                  ? t("settings.network.invalidCaCert")
                  : undefined
              }
              saved={savedField === "caCertPath"}
              savedLabel={t("settings.network.saved")}
              onCommit={() =>
                persistField("caCertPath", {
                  key: SETTINGS_KEYS.networkCaCertPath,
                  serialize: (v) => v.trim(),
                })
              }
            />
          )}
        />
      </Row>
      <div className="border-border bg-secondary/40 text-muted-foreground mt-1 mb-4 flex items-start gap-2.5 rounded-[10px] border px-3.5 py-3 text-[12px] leading-[1.55]">
        <Info className="mt-px h-3.5 w-3.5 shrink-0 opacity-70" />
        <span>{t("settings.network.envNote")}</span>
      </div>
    </SettingsPanel>
  );
}

/**
 * A single Network text setting: input + inline validation + a transient
 * "Saved" confirmation. Kept local so both rows share the exact same behavior.
 */
function NetworkField({
  id,
  field,
  placeholder,
  error,
  saved,
  savedLabel,
  onCommit,
}: {
  id: string;
  field: ControllerRenderProps<NetworkSettingsForm, keyof NetworkSettingsForm>;
  placeholder: string;
  error?: string;
  saved: boolean;
  savedLabel: string;
  onCommit: () => void;
}): React.JSX.Element {
  return (
    <div className="flex max-w-md flex-col gap-1.5">
      <Input
        id={id}
        type="text"
        spellCheck={false}
        autoComplete="off"
        name={field.name}
        ref={field.ref}
        value={field.value}
        onChange={field.onChange}
        onBlur={() => {
          field.onBlur();
          onCommit();
        }}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
      />
      <div className="flex min-h-[16px] items-center">
        {error ? (
          <span className="text-destructive text-xs">{error}</span>
        ) : saved ? (
          <span className="text-primary inline-flex items-center gap-1 text-xs">
            <Check className="h-3 w-3" />
            {savedLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}

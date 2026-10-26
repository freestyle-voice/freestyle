import { TutorialDemo } from "@renderer/components/tutorial-demo";
import { Button } from "@renderer/components/ui/button";
import { useSetupPermissions } from "@renderer/hooks/use-setup-permissions";
import { useCloudAuth } from "@renderer/lib/auth-context";
import { HAS_NATIVE_DESKTOP, IS_MAC, IS_WINDOWS } from "@renderer/lib/platform";
import { settingsQueryOptions } from "@renderer/lib/query";
import { useModels } from "@renderer/pages/models/use-models";
import { useQuery } from "@tanstack/react-query";
import { Check, Circle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

export function SetupChecklist({
  onChooseModel,
  onReadyChange,
  path,
}: {
  onChooseModel: () => void;
  onReadyChange: (ready: boolean) => void;
  path: "cloud" | "local";
}) {
  const models = useModels();
  const { user } = useCloudAuth();
  const { data: settings } = useQuery(settingsQueryOptions());
  const permissions = useSetupPermissions();
  const [practicing, setPracticing] = useState(false);
  const voice = models.defaultVoice;
  const localId = voice?.model_id.split("/").slice(1).join("/");
  const clipboard = settings?.output_mode === "clipboard";
  const pasteReady = clipboard || !IS_MAC || permissions.accessibility === true;
  let modelReady = false;
  let modelDetail = "Choose a local model or connect a transcription provider.";
  if (voice?.provider === "freestyle-cloud") {
    modelReady = !!user && path === "cloud";
    modelDetail =
      path === "local"
        ? "Freestyle Cloud is currently selected. Choose a local model or your own transcription provider for this setup path."
        : user
          ? "Freestyle Cloud is selected. Audio is sent to Freestyle Cloud for transcription."
          : "Sign in or choose a model that works without an account.";
  } else if (voice?.provider === "local-whisper") {
    modelReady =
      !!models.whisperStatus?.binaryAvailable &&
      models.whisperStatus.models.some(
        (model) => model.model === localId && model.status === "ready",
      );
    modelDetail = modelReady
      ? `${voice.model_name} is downloaded. Transcription runs on this device.`
      : "Download the selected model and its engine to use it on this device.";
  } else if (voice?.provider === "local-mlx") {
    modelReady =
      !!models.mlxStatus?.canRun &&
      models.mlxStatus.models.some(
        (model) => model.model === localId && model.status === "ready",
      );
    modelDetail = modelReady
      ? `${voice.model_name} is downloaded. Transcription runs on this device.`
      : "Finish downloading the selected model and setting up its engine.";
  } else if (
    voice?.provider === "openai" &&
    settings?.openai_stt_base_url?.trim()
  ) {
    modelReady = !!settings?.openai_stt_base_url?.trim();
    modelDetail = modelReady
      ? `${voice.model_name} will use your configured transcription endpoint.`
      : "Connect your transcription endpoint in Models.";
  } else if (voice) {
    const key = models.apiKeys.find((key) => key.provider === voice.provider);
    modelReady = !!key && key.status !== "invalid";
    modelDetail = modelReady
      ? `${voice.model_name} is selected. Audio is sent to your provider using your API key.`
      : "Connect or update this provider’s API key in Models.";
  }
  if (models.setupChecking) {
    modelReady = false;
    modelDetail = "Checking your selected model…";
  }
  if (models.setupError) {
    modelReady = false;
    modelDetail = models.setupError;
  }
  const micReady = permissions.mic === "granted";
  const ready = modelReady && micReady && pasteReady;
  useEffect(() => {
    onReadyChange(ready);
  }, [onReadyChange, ready]);
  const micBlocked =
    permissions.mic === "denied" || permissions.mic === "restricted";

  return (
    <>
      <ol
        className="m-0 list-none divide-y divide-border rounded-xl border border-border bg-card/50 px-5 sm:px-6"
        aria-label="Dictation setup checklist"
      >
        <SetupItem
          title="Transcription model"
          ready={modelReady}
          checking={models.setupChecking}
          detail={modelDetail}
        >
          <Button variant="outline" onClick={onChooseModel}>
            {voice ? "Change model" : "Choose model"}
          </Button>
          {models.setupError && (
            <Button
              variant="ghost"
              onClick={() => void models.retrySetupCheck()}
            >
              Retry model check
            </Button>
          )}
        </SetupItem>
        <SetupItem
          title="Microphone access"
          ready={micReady}
          checking={permissions.mic === "checking"}
          detail={
            micReady
              ? "Freestyle can hear you when you start dictating."
              : permissions.mic === "restricted"
                ? "Microphone access is restricted by your system or administrator. Check your device policy or system settings."
                : micBlocked
                  ? "Allow Freestyle to use the microphone in your system’s privacy settings, then return here."
                  : "Allow microphone access so Freestyle can transcribe your voice."
          }
        >
          {!micReady && (
            <Button
              variant="outline"
              disabled={permissions.busy || permissions.mic === "checking"}
              onClick={() => void permissions.request("mic")}
            >
              {micBlocked && HAS_NATIVE_DESKTOP && (IS_MAC || IS_WINDOWS)
                ? "Open microphone settings"
                : "Allow microphone"}
            </Button>
          )}
        </SetupItem>
        <SetupItem
          title={clipboard ? "Clipboard output" : "Text delivery"}
          ready={pasteReady}
          detail={
            clipboard
              ? "Transcripts are copied to your clipboard. Paste them into the app you’re using."
              : IS_MAC
                ? pasteReady
                  ? "Accessibility access lets Freestyle paste into your focused text field."
                  : "Allow Accessibility access for Freestyle in System Settings so it can paste into other apps."
                : "Freestyle pastes your transcript into the focused text field."
          }
        >
          {!pasteReady && (
            <Button
              variant="outline"
              disabled={permissions.busy || !HAS_NATIVE_DESKTOP}
              onClick={() => void permissions.request("paste")}
            >
              Open Accessibility settings
            </Button>
          )}
        </SetupItem>
      </ol>
      {permissions.error && (
        <p role="alert" className="text-destructive text-sm">
          {permissions.error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="text-muted-foreground m-0" role="status">
          {ready
            ? "Ready for a test dictation."
            : permissions.waiting
              ? "Waiting for permission changes. You can return here when you’re done."
              : "Complete the checks above to try dictation."}
        </p>
        <Button
          variant="ghost"
          onClick={() => {
            void permissions.refresh();
            void models.retrySetupCheck();
          }}
        >
          Check again
        </Button>
      </div>
      <section
        aria-labelledby="practice-title"
        className="border-border border-t pt-6"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="practice-title" className="m-0 text-base font-medium">
              Try your first dictation
            </h2>
            <p className="text-muted-foreground mt-1 mb-0 text-sm">
              Use your shortcut and speak a sentence. This uses your selected
              model.
            </p>
          </div>
          {!practicing && (
            <Button disabled={!ready} onClick={() => setPracticing(true)}>
              Try dictation
            </Button>
          )}
        </div>
        {practicing && ready && <TutorialDemo interactive />}
        {practicing && !ready && (
          <p className="text-muted-foreground text-sm">
            Your setup changed. Complete the checks above to keep practicing.
          </p>
        )}
        {practicing && ready && (
          <p className="text-muted-foreground mt-3 mb-0 text-sm">
            If your words appear correctly, you’re ready to go. You can change
            your shortcut and text delivery in Settings → Dictation.
          </p>
        )}
      </section>
    </>
  );
}

function SetupItem({
  title,
  ready,
  checking,
  detail,
  children,
}: {
  title: string;
  ready: boolean;
  checking?: boolean;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-start gap-3 py-5 sm:flex-nowrap">
      <span
        className="mt-0.5 shrink-0"
        role="img"
        aria-label={checking ? "Checking" : ready ? "Ready" : "Needs setup"}
      >
        {checking ? (
          <Loader2
            aria-hidden="true"
            className="text-muted-foreground size-5 animate-spin"
          />
        ) : ready ? (
          <Check aria-hidden="true" className="text-primary size-5" />
        ) : (
          <Circle aria-hidden="true" className="text-muted-foreground size-5" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="m-0 text-sm font-medium">{title}</h2>
        <p className="text-muted-foreground mt-1 mb-0 text-sm leading-5">
          {detail}
        </p>
      </div>
      <div className="ml-8 flex shrink-0 flex-wrap gap-2 sm:ml-0">
        {children}
      </div>
    </li>
  );
}

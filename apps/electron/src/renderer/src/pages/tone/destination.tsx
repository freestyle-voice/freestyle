import type {
  CleanupEmailTone,
  CleanupOverallTone,
  CleanupPersonalTone,
  CleanupWorkTone,
} from "@freestyle-voice/validations";
import { AppAssignments } from "@renderer/components/tone-previews/app-assignments";
import { AppMarkRow } from "@renderer/components/tone-previews/app-marks";
import { EmailPreview } from "@renderer/components/tone-previews/email-preview";
import { NotePreview } from "@renderer/components/tone-previews/note-preview";
import { TextMessagePreview } from "@renderer/components/tone-previews/text-message-preview";
import { WorkChatPreview } from "@renderer/components/tone-previews/work-chat-preview";
import { ChevronLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, Navigate, useParams } from "react-router";
import { Eyebrow, PageHeader, PageShell } from "../models/page-chrome";
import { ToneStateBanner } from "./banners";
import { useDestinationSummary } from "./destination-summary";
import {
  type DestinationMeta,
  destinationValue,
  findDestinationBySlug,
} from "./options";
import { ToneCards } from "./tone-cards";
import { type ToneSettings, useToneSettings } from "./use-tone-settings";

export default function ToneDestinationPage(): React.JSX.Element {
  const { t } = useTranslation();
  const { destination: slug } = useParams();
  const meta = findDestinationBySlug(slug);
  const settings = useToneSettings();

  // An unknown slug is a stale link, not an error worth a page — send them to
  // the index, which shows every destination anyway.
  if (!meta) return <Navigate to="/settings/tone" replace />;

  if (settings.loading) {
    return (
      <PageShell>
        <div className="mx-auto w-full max-w-[1060px]">
          <div className="flex items-center justify-center py-24">
            <p className="text-muted-foreground text-sm">{t("tone.loading")}</p>
          </div>
        </div>
      </PageShell>
    );
  }

  return <DestinationBody meta={meta} settings={settings} />;
}

function DestinationBody({
  meta,
  settings,
}: {
  meta: DestinationMeta;
  settings: ToneSettings;
}): React.JSX.Element {
  const { t } = useTranslation();
  const value = destinationValue(meta, settings);
  const { appIds, assignments } = useDestinationSummary(meta, settings);

  const active =
    meta.options.find((option) => option.value === value) ?? meta.options[0]!;

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[1060px]">
        <Link
          to="/settings/tone"
          className="text-muted-foreground hover:text-foreground -ml-1 mb-4 inline-flex items-center gap-1 text-[12px] transition-colors"
        >
          <ChevronLeft className="size-3.5" aria-hidden="true" />
          {t("tone.title")}
        </Link>

        <PageHeader
          title={t(`tone.${meta.group}.rowTitle`)}
          subtitle={t(`tone.${meta.group}.pageSubtitle`)}
        />

        <ToneStateBanner settings={settings} />

        <section className="mt-7">
          <Eyebrow text={t("tone.sections.voice")} mono />
          <div className="mt-3">
            <ToneCards
              label={t(`tone.${meta.group}.rowTitle`)}
              options={meta.options}
              value={value}
              onChange={(next) => saveDestination(meta, settings, next)}
            />
          </div>
        </section>

        <section className="mt-7">
          <Eyebrow text={t("tone.previewLabel")} mono />
          <div className="border-border bg-card mt-3 grid gap-5 rounded-[14px] border p-5 min-[820px]:grid-cols-2 min-[820px]:gap-8">
            <div>
              <Eyebrow text={t("tone.cleanup.preview.rawLabel")} />
              <p className="text-muted-foreground mt-2 text-[13px] leading-[1.6]">
                {t(`tone.${meta.group}.preview.rawSample`)}
              </p>
            </div>
            <div className="min-[820px]:border-border/60 min-[820px]:border-l min-[820px]:pl-8">
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <Eyebrow text={t(`tone.${meta.group}.resultLabel`)} accent />
                <Eyebrow text={t(active.titleKey)} />
              </div>
              <DestinationPreview
                meta={meta}
                sample={t(active.sampleKey)}
                isOff={active.value === "off"}
              />
            </div>
          </div>
        </section>

        {/* The fallback destination has nothing to route — it is defined as
            whatever the other three don't claim — so it gets no section here.
            Its subtitle carries the explanation instead. */}
        {meta.canManageRoutes ? (
          <section className="mt-7 mb-2">
            <Eyebrow text={t("tone.sections.whereUsed")} mono />
            <div className="border-border bg-card mt-3 rounded-[14px] border px-5 py-4">
              <AppMarkRow
                ids={appIds}
                assignments={assignments}
                size={30}
                trailing={
                  <AppAssignments
                    destination={meta.destination}
                    items={assignments}
                    allItems={settings.assignments}
                    onAdd={settings.addAssignment}
                    onRemove={settings.removeAssignment}
                  />
                }
              />
            </div>
          </section>
        ) : null}
      </div>
    </PageShell>
  );
}

function DestinationPreview({
  meta,
  sample,
  isOff,
}: {
  meta: DestinationMeta;
  sample: string;
  isOff: boolean;
}): React.JSX.Element {
  const { t } = useTranslation();

  // "Off" means no styling at all, so every destination shows the same plain
  // rendering rather than a chat bubble that implies a voice was applied.
  if (isOff) return <NotePreview sample={sample} selected={false} />;

  switch (meta.previewKind) {
    case "personal":
      return <TextMessagePreview sample={sample} selected={false} />;
    case "work":
      return (
        <WorkChatPreview
          sample={sample}
          selected={false}
          sender={t("tone.work.preview.sender")}
          time={t("tone.work.preview.time")}
        />
      );
    case "email":
      return (
        <EmailPreview
          body={sample}
          selected={false}
          to={t("tone.email.preview.to")}
          subject={t("tone.email.preview.subject")}
        />
      );
    default:
      return <NotePreview sample={sample} selected={false} />;
  }
}

function saveDestination(
  meta: DestinationMeta,
  settings: ToneSettings,
  next: string,
): void {
  switch (meta.destination) {
    case "personal":
      settings.savePersonalTone(next as CleanupPersonalTone);
      return;
    case "work":
      settings.saveWorkTone(next as CleanupWorkTone);
      return;
    case "email":
      settings.saveEmailTone(next as CleanupEmailTone);
      return;
    default:
      settings.saveOverallTone(next as CleanupOverallTone);
  }
}

// Freestyle — App Redesign canvas. Full coverage map.

function RedesignCanvas() {
  return (
    <DesignCanvas>
      <DCSection id="cover" title="Freestyle — every screen"
        subtitle="Final coverage. Locked direction: Cream pill, Timeline home, Vertical-rows settings, Newsreader type.">
        <DCArtboard id="cover" label="Cover · table of contents" width={1280} height={780}>
          <CoverArtboard />
        </DCArtboard>
      </DCSection>

      <DCSection id="pill" title="01 · Floating pill"
        subtitle="Six states on a cream desktop. The pill never steals focus; it lives at the corner you choose.">
        <DCArtboard id="pill-cream" label="Pill · all states" width={1100} height={680}>
          <PillCreamArtboard />
        </DCArtboard>
      </DCSection>

      <DCSection id="onboarding" title="02 · Onboarding"
        subtitle="Three steps. Permissions, one on-device model, learn to use it.">
        <DCArtboard id="onb-1" label="Permissions" width={1100} height={780}>
          <OnboardingPermissions />
        </DCArtboard>
        <DCArtboard id="onb-2" label="Model · download" width={1100} height={780}>
          <OnboardingModel />
        </DCArtboard>
        <DCArtboard id="onb-3" label="How to use" width={1100} height={780}>
          <OnboardingTutorial />
        </DCArtboard>
      </DCSection>

      <DCSection id="today" title="03 · Today (home)"
        subtitle="Open the app and you land on your day's voice — not a settings panel.">
        <DCArtboard id="today-tutorial" label="Top · E · Tutorial (animated)" width={1280} height={780}>
          <TutorialArtboard />
        </DCArtboard>
        <DCArtboard id="today-top-alts" label="Top of timeline · 4 alternatives" width={1280} height={780}>
          <TopAlternativesArtboard />
        </DCArtboard>
        <DCArtboard id="today-timeline" label="Timeline · with content" width={1280} height={820}>
          <HomeTimelineScreen />
        </DCArtboard>
        <DCArtboard id="today-empty" label="Timeline · empty state" width={1280} height={820}>
          <HomeTimelineEmpty />
        </DCArtboard>
      </DCSection>

      <DCSection id="settings" title="04 · Settings"
        subtitle="Vertical rows. Capture state shown live.">
        <DCArtboard id="settings-main" label="Settings · main" width={1280} height={780}>
          <GeneralP1 />
        </DCArtboard>
        <DCArtboard id="settings-hotkey" label="Settings · hotkey recording" width={1280} height={780}>
          <SettingsHotkeyRecording />
        </DCArtboard>
      </DCSection>

      <DCSection id="models" title="05 · Models"
        subtitle="Voice + optional cleanup LLM. Bring your own keys.">
        <DCArtboard id="models-main" label="Models · configured" width={1280} height={780}>
          <ModelsScreen />
        </DCArtboard>
        <DCArtboard id="models-empty" label="Models · empty state" width={1280} height={780}>
          <ModelsEmpty />
        </DCArtboard>
        <DCArtboard id="models-modal" label="Models · API key modal" width={1280} height={780}>
          <ModelsKeyModal />
        </DCArtboard>
      </DCSection>

      <DCSection id="dictionary" title="06 · Dictionary"
        subtitle="Spoken shortcuts that expand inline.">
        <DCArtboard id="dictionary-main" label="Dictionary · main" width={1280} height={780}>
          <DictionaryScreen />
        </DCArtboard>
        <DCArtboard id="dictionary-empty" label="Dictionary · empty" width={1280} height={780}>
          <DictionaryEmpty />
        </DCArtboard>
      </DCSection>

      <DCSection id="formats" title="07 · Formats"
        subtitle="Per-app formatting instructions sent to the LLM.">
        <DCArtboard id="formats-main" label="Formats · custom + defaults" width={1280} height={780}>
          <FormatsScreen />
        </DCArtboard>
      </DCSection>

      <DCSection id="history" title="08 · History"
        subtitle="Every past session, grouped by day.">
        <DCArtboard id="history-main" label="History · main" width={1280} height={780}>
          <HistoryScreen />
        </DCArtboard>
        <DCArtboard id="history-empty" label="History · empty" width={1280} height={780}>
          <HistoryEmpty />
        </DCArtboard>
      </DCSection>

      <DCSection id="feedback" title="09 · Feedback"
        subtitle="Quick form. Email optional. We reply.">
        <DCArtboard id="feedback-main" label="Feedback · form" width={1280} height={780}>
          <FeedbackScreen />
        </DCArtboard>
        <DCArtboard id="feedback-sent" label="Feedback · sent" width={1280} height={780}>
          <FeedbackSent />
        </DCArtboard>
      </DCSection>

      <DCSection id="system" title="10 · System screens"
        subtitle="Menu-bar tray, 404.">
        <DCArtboard id="tray" label="Tray · menu bar dropdown" width={1100} height={680}>
          <TrayMenuArtboard />
        </DCArtboard>
        <DCArtboard id="notfound" label="Not found · 404" width={1280} height={780}>
          <NotFoundScreen />
        </DCArtboard>
      </DCSection>

      <DCSection id="archive" title="— · Explorations (archive)"
        subtitle="Earlier directions kept for reference. Not part of the final spec.">
        <DCArtboard id="pill-strip" label="Pill · A · Strip (dark)" width={1100} height={680}>
          <PillStripArtboard />
        </DCArtboard>
        <DCArtboard id="pill-glass" label="Pill · C · Glass" width={1100} height={680}>
          <PillGlassArtboard />
        </DCArtboard>
        <DCArtboard id="pill-overview" label="Pill · three side-by-side" width={1280} height={780}>
          <PillComparisonArtboard />
        </DCArtboard>
        <DCArtboard id="home-script" label="Home · A · The Daily Script" width={1280} height={820}>
          <HomeScriptScreen />
        </DCArtboard>
        <DCArtboard id="home-desk" label="Home · B · The Editor's Desk" width={1280} height={820}>
          <HomeDeskScreen />
        </DCArtboard>
        <DCArtboard id="home-prop" label="Home · proposition" width={1100} height={620}>
          <HomeProposition />
        </DCArtboard>
        <DCArtboard id="settings-p2" label="Settings · P2 · Bento" width={1280} height={780}>
          <GeneralP2 />
        </DCArtboard>
        <DCArtboard id="settings-p3" label="Settings · P3 · Two-column" width={1280} height={780}>
          <GeneralP3 />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<RedesignCanvas />);

/**
 * Users can configure dictation even when they defer microphone or
 * keyboard setup. Voice setup is therefore guidance, never an onboarding gate.
 */
export function canCompleteOnboardingWithoutVoiceSetup(): boolean {
  return true;
}

/**
 * The app remains useful for typed Remix even when a user defers microphone or
 * keyboard setup. Voice setup is therefore guidance, never an onboarding gate.
 */
export function canCompleteOnboardingWithoutVoiceSetup(): boolean {
  return true;
}

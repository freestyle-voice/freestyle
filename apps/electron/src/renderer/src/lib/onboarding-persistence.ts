import { apiFetch } from "./api";
import type { OnboardingSaved } from "./onboarding-core";
import { ONBOARDING_KEY } from "./onboarding-core";

export async function saveOnboarding(state: OnboardingSaved): Promise<void> {
  const response = await apiFetch(`/api/settings/${ONBOARDING_KEY}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value: JSON.stringify(state) }),
  });
  if (!response.ok) throw new Error("Couldn’t save your setup. Try again.");
}

import { apiFetch } from "@renderer/lib/api";

export type AutomationTemplate = {
  id: string;
  name: string;
  schedule: string;
  toolkits: string[];
  cron: string | null;
};

export type ApplyTemplatesResult = {
  applied: Array<{ id: string; path: string; name: string }>;
  skipped: Array<{ id: string; reason: string }>;
};

async function responseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | T
    | { error?: string }
    | null;
  if (!response.ok) {
    const error = (payload as { error?: string } | null)?.error;
    throw new Error(
      error === "cloud_auth_required"
        ? "Sign in to Freestyle first."
        : (error ?? "Scheduled tasks are unavailable."),
    );
  }
  return payload as T;
}

export async function listAutomationTemplates(): Promise<AutomationTemplate[]> {
  const data = await responseJson<{ templates: AutomationTemplate[] }>(
    await apiFetch("/api/scheduled/templates"),
  );
  return data.templates;
}

export async function applyAutomationTemplates(
  templates: string[],
): Promise<ApplyTemplatesResult> {
  return responseJson<ApplyTemplatesResult>(
    await apiFetch("/api/scheduled/templates/apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templates,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    }),
  );
}

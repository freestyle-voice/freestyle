import type { UIMessage } from "ai";

export type MobileToolPhase = "running" | "done" | "declined" | "failed";

export type MobileToolActivityItem = {
  title: string;
  detail?: string;
  phase: MobileToolPhase;
};

type ToolPart = {
  type: string;
  state?: string;
  input?: unknown;
  output?: { ok?: boolean; reason?: string };
};

const TOOL_LABELS: Record<string, string> = {
  "tool-current_time": "Checked the time",
  "tool-web_search": "Searched the web",
  "tool-image_search": "Searched for images",
};

function words(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
}

function sentence(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function appName(slug: string): string {
  const known: Record<string, string> = {
    gmail: "Gmail",
    github: "GitHub",
    google_calendar: "Google Calendar",
    google_drive: "Google Drive",
  };
  return (
    known[slug] ?? slug.split(/[-_]/).filter(Boolean).map(sentence).join(" ")
  );
}

function isConnectorTool(partType: string): boolean {
  return /^tool-connector__[a-zA-Z0-9_-]+__(?:ro_)?[a-zA-Z0-9_]+$/.test(
    partType,
  );
}

function connectorAction(partType: string, input: unknown): string {
  const requested =
    input && typeof input === "object"
      ? (input as { tool_slug?: unknown }).tool_slug
      : undefined;
  if (typeof requested === "string" && /^[A-Z0-9_]+$/.test(requested)) {
    return sentence(words(requested));
  }
  const encoded = partType.split("__").at(-1)?.replace(/^ro_/, "") ?? "";
  if (!/^(?:[0-9a-f]{2})+$/i.test(encoded)) return sentence(words(encoded));
  try {
    const decoded = new TextDecoder().decode(
      Uint8Array.from(encoded.match(/.{2}/g) ?? [], (byte) =>
        Number.parseInt(byte, 16),
      ),
    );
    return sentence(words(decoded));
  } catch {
    return sentence(words(encoded));
  }
}

function connectorActionDetail(action: string, toolkitSlug: string): string {
  const prefix = toolkitSlug.replace(/[-_]+/g, " ").toLowerCase();
  return sentence(action.replace(new RegExp(`^${prefix}\\s*`, "i"), ""));
}

function toolPhase(tool: ToolPart): MobileToolPhase {
  if (tool.state === "input-streaming" || tool.state === "input-available") {
    return "running";
  }
  if (tool.state === "output-error" || tool.output?.ok === false) {
    return tool.output?.reason === "user-declined" ? "declined" : "failed";
  }
  return "done";
}

function toolItem(tool: ToolPart): MobileToolActivityItem {
  const phase = toolPhase(tool);
  if (isConnectorTool(tool.type)) {
    const [, slug = "connected-app"] = tool.type
      .replace(/^tool-/, "")
      .split("__");
    const app = appName(slug);
    const action = connectorActionDetail(
      connectorAction(tool.type, tool.input),
      slug,
    );
    return {
      title:
        phase === "declined"
          ? `Didn't use ${app}`
          : phase === "failed"
            ? `${app} didn't respond`
            : app,
      detail:
        phase === "running"
          ? action
            ? `${action.replace(/ed$/, "ing")}`
            : "Working"
          : action || undefined,
      phase,
    };
  }

  const label = TOOL_LABELS[tool.type] ?? sentence(words(tool.type.slice(5)));
  return {
    title:
      phase === "running"
        ? label.replace(/ed$/, "ing")
        : phase === "failed"
          ? `${label} didn't work`
          : phase === "declined"
            ? `Didn't ${label.toLowerCase()}`
            : label,
    phase,
  };
}

/** Maps AI SDK tool parts to privacy-safe, user-facing execution summaries. */
export function mobileToolActivity(
  parts: UIMessage["parts"],
): MobileToolActivityItem[] {
  return parts
    .filter(
      (part) =>
        part.type.startsWith("tool-") &&
        part.type !== "tool-suggest_connections" &&
        // Tool discovery is an internal planning step. Keep the transcript
        // focused on the services Remix actually used on the user's behalf.
        part.type !== "tool-connector_search_tools",
    )
    .map((part) => toolItem(part as ToolPart));
}

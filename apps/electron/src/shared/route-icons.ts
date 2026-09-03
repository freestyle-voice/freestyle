export type BuiltinRouteIconId =
  | "messages"
  | "whatsapp"
  | "telegram"
  | "discord"
  | "slack"
  | "linkedin"
  | "work_chat"
  | "gmail"
  | "outlook"
  | "apple_mail"
  | "proton";

export function normalizeRouteIconHost(raw: string): string {
  return raw
    .replace(/^www\./, "")
    .trim()
    .toLowerCase();
}

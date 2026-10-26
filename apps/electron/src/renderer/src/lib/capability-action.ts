type CapabilityAction = {
  prompt?: string;
  templateId?: string;
  toolkitSlug?: string;
  locked?: boolean;
};

type SetupState = "pending" | "applied" | "failed";

export function capabilityActionLabel(
  item: CapabilityAction,
  state?: SetupState,
): string {
  if (item.locked) return "Connect app";
  if (item.templateId) {
    if (state === "pending") return "Adding…";
    if (state === "applied") return "Added";
    if (state === "failed") return "Retry setup";
    return "Add automation";
  }
  return "Start chat";
}

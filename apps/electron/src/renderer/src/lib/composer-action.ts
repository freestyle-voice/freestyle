export function composerAction(status: string): "send" | "stop" {
  return status === "submitted" || status === "streaming" ? "stop" : "send";
}

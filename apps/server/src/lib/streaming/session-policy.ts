/**
 * Some providers tolerate long-lived warm sessions well; others surface
 * those sessions as a single request spanning app idle time. Soniox logs
 * one request for the full lifetime of its upstream WebSocket, so we keep
 * those sessions ephemeral and tie them to a single recording.
 */
export function shouldKeepStreamingUpstreamAlive(providerId: string): boolean {
  return providerId !== "soniox";
}

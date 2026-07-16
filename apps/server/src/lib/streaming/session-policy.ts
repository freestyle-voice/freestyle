/**
 * Some providers tolerate long-lived warm sessions well; others surface
 * those sessions as a single request spanning app idle time. Soniox logs
 * one request for the full lifetime of its upstream WebSocket, so we keep
 * those sessions ephemeral and tie them to a single recording. Freestyle
 * Cloud sessions are also ephemeral: the upstream closes after each
 * transcription and reconnects on the next `start` (hotkey-down), which
 * gives a natural pre-warm window while the user is still speaking.
 */
export function shouldKeepStreamingUpstreamAlive(providerId: string): boolean {
  return providerId !== "soniox" && providerId !== "freestyle-cloud";
}

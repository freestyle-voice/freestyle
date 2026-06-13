/**
 * Mic permission resolution that works on every platform.
 *
 * macOS and Windows report a real status from the OS privacy settings via
 * the main process. Linux has no such API, so the main process returns
 * "unknown" and we resolve the real state by briefly opening a capture
 * stream.
 */

async function probeMicAccess(): Promise<"granted" | "denied"> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    return "granted";
  } catch {
    return "denied";
  }
}

export async function resolveMicStatus(): Promise<string> {
  const status = (await window.api?.checkMicPermission()) ?? "unknown";
  return status === "unknown" ? probeMicAccess() : status;
}

export async function requestMicAccess(): Promise<string> {
  const status = (await window.api?.requestMicPermission()) ?? "unknown";
  return status === "unknown" ? probeMicAccess() : status;
}

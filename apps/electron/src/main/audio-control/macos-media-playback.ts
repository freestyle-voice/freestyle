import { execFile, execFileSync } from "node:child_process";
import { getNativeBinaryPath } from "../native-binary";

function execFileText(path: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(path, args, { encoding: "utf8" }, (err, stdout, stderr) => {
      if (err) {
        const detail = typeof stderr === "string" ? stderr.trim() : "";
        reject(new Error(detail || err.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function execFileTextSync(path: string, args: string[]): string {
  return execFileSync(path, args, { encoding: "utf8" }).trim();
}

export class MacosMediaPlayback {
  private active = false;

  async pausePlayback(): Promise<boolean> {
    if (process.platform !== "darwin") return false;
    if (this.active) return true;

    const binaryPath = getNativeBinaryPath("macos-media-control");
    if (!binaryPath) return false;

    try {
      await execFileText(binaryPath, ["pause"]);
      this.active = true;
      return true;
    } catch {
      return false;
    }
  }

  async restore(): Promise<void> {
    if (process.platform !== "darwin") return;
    if (!this.active) return;

    this.active = false;
    const binaryPath = getNativeBinaryPath("macos-media-control");
    if (!binaryPath) return;

    try {
      await execFileText(binaryPath, ["resume"]);
    } catch {
      // A media session may disappear while recording. Nothing to restore then.
    }
  }

  restoreSync(): void {
    if (process.platform !== "darwin") return;
    if (!this.active) return;

    this.active = false;
    const binaryPath = getNativeBinaryPath("macos-media-control");
    if (!binaryPath) return;

    try {
      execFileTextSync(binaryPath, ["resume"]);
    } catch {
      // Quit cleanup should never block app shutdown on media restore failure.
    }
  }
}

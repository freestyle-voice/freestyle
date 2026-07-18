import { execFile } from "node:child_process";
import { readFileSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

/** Max dimension (width) for screenshots sent to the model. */
const MAX_WIDTH = 1024;

/** Max file size in bytes before we refuse to inline as base64 (~1.5 MB). */
const MAX_INLINE_BYTES = 1_500_000;

export async function takeScreenshot(args: {
  returnImage?: boolean;
}): Promise<{ type: "image"; data: string } | { type: "path"; path: string }> {
  const returnImage = args.returnImage !== false;
  const tmpPath = join(tmpdir(), `freestyle-screenshot-${Date.now()}.jpg`);

  const plat = process.platform;

  try {
    if (plat === "darwin") {
      // -D 1 = main display only (avoids multi-monitor mega-screenshots)
      // -t jpg = JPEG for smaller file size
      // -x = no sound
      await execFileP(
        "screencapture",
        ["-x", "-D", "1", "-t", "jpg", tmpPath],
        { timeout: 10_000 },
      );
      // Resize with sips (built-in on macOS) to keep token cost down
      await resizeWithSips(tmpPath, MAX_WIDTH);
    } else if (plat === "win32") {
      const script = `
        Add-Type -A System.Drawing
        Add-Type -A System.Windows.Forms
        $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
        $bmp.Save('${tmpPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Jpeg)
        $g.Dispose()
        $bmp.Dispose()
      `;
      await execFileP("powershell", ["-NoProfile", "-Command", script], {
        timeout: 10_000,
      });
    } else {
      // Linux: try grim (Wayland), then scrot (X11), then import (ImageMagick)
      let captured = false;
      for (const [cmd, cmdArgs] of [
        ["grim", [tmpPath]],
        ["scrot", [tmpPath]],
        ["import", ["-window", "root", tmpPath]],
      ] as [string, string[]][]) {
        try {
          await execFileP(cmd, cmdArgs, { timeout: 10_000 });
          captured = true;
          break;
        } catch {}
      }
      if (!captured) {
        return {
          type: "path",
          path: "Error: no screenshot tool found (install grim, scrot, or imagemagick)",
        };
      }
    }

    if (returnImage) {
      // Safety check: refuse to inline absurdly large files
      try {
        const size = statSync(tmpPath).size;
        if (size > MAX_INLINE_BYTES) {
          return {
            type: "path",
            path: `Screenshot saved to ${tmpPath} (${(size / 1_000_000).toFixed(1)} MB — too large to inline).`,
          };
        }
      } catch {}

      const buf = readFileSync(tmpPath);
      try {
        unlinkSync(tmpPath);
      } catch {}
      return { type: "image", data: buf.toString("base64") };
    }

    return { type: "path", path: tmpPath };
  } catch (err) {
    return {
      type: "path",
      path: `Error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Resize an image using macOS's built-in `sips` command. Only shrinks; if the
 * image is already smaller than maxWidth, no-op.
 */
async function resizeWithSips(
  filePath: string,
  maxWidth: number,
): Promise<void> {
  try {
    // Get current width
    const { stdout } = await execFileP("sips", ["-g", "pixelWidth", filePath], {
      timeout: 5000,
    });
    const match = stdout.match(/pixelWidth:\s*(\d+)/);
    if (!match) return;
    const currentWidth = Number(match[1]);
    if (currentWidth <= maxWidth) return;

    // Resize proportionally
    await execFileP("sips", ["--resampleWidth", String(maxWidth), filePath], {
      timeout: 5000,
    });
  } catch {
    // Best-effort; if sips fails, we still have the original screenshot
  }
}

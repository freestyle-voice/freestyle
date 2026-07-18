import { execFile } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export async function takeScreenshot(args: {
  returnImage?: boolean;
}): Promise<{ type: "image"; data: string } | { type: "path"; path: string }> {
  const returnImage = args.returnImage !== false;
  const tmpPath = join(tmpdir(), `freestyle-screenshot-${Date.now()}.png`);

  const plat = process.platform;

  try {
    if (plat === "darwin") {
      await execFileP("screencapture", ["-x", "-t", "png", tmpPath], {
        timeout: 10_000,
      });
    } else if (plat === "win32") {
      // PowerShell .NET screenshot capture
      const script = `
        Add-Type -A System.Drawing
        Add-Type -A System.Windows.Forms
        $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
        $bmp.Save('${tmpPath.replace(/'/g, "''")}')
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

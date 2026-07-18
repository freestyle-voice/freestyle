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
      await captureMacScreen(tmpPath);
      await resizeWithSips(tmpPath, MAX_WIDTH);
    } else if (plat === "win32") {
      await captureWindowsScreen(tmpPath);
    } else {
      const captured = await captureLinuxScreen(tmpPath);
      if (!captured) {
        return {
          type: "path",
          path: "Error: no screenshot tool found (install grim, scrot, or imagemagick)",
        };
      }
    }

    if (returnImage) {
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
 * Capture the screen containing the mouse cursor on macOS. Hides the
 * Freestyle pill window before capturing so it doesn't occlude content,
 * then restores it. Uses `screencapture -R x,y,w,h` with the cursor's
 * screen bounds so multi-monitor setups capture only the relevant display.
 */
async function captureMacScreen(outPath: string): Promise<void> {
  // Hide Freestyle window so it doesn't appear in the screenshot
  await setFreestyleVisible(false);
  // Brief pause to let the window disappear before the capture
  await sleep(150);

  try {
    const bounds = await getMacCursorScreenBounds();
    if (bounds) {
      await execFileP(
        "screencapture",
        [
          "-x",
          "-R",
          `${bounds.x},${bounds.y},${bounds.w},${bounds.h}`,
          "-t",
          "jpg",
          outPath,
        ],
        { timeout: 10_000 },
      );
    } else {
      await execFileP(
        "screencapture",
        ["-x", "-D", "1", "-t", "jpg", outPath],
        {
          timeout: 10_000,
        },
      );
    }
  } finally {
    await setFreestyleVisible(true);
  }
}

/**
 * Get the pixel bounds of the macOS screen containing the mouse cursor.
 * Uses NSScreen via osascript — no Electron dependency needed.
 *
 * NSScreen frame coordinates use bottom-left origin; screencapture -R uses
 * top-left. The script converts by computing:
 *   screenTop = totalHeight - frame.origin.y - frame.size.height
 */
async function getMacCursorScreenBounds(): Promise<{
  x: number;
  y: number;
  w: number;
  h: number;
} | null> {
  try {
    const script = [
      'use framework "AppKit"',
      "set mouseLocation to current application's NSEvent's mouseLocation()",
      "set mx to mouseLocation's x as real",
      "set my to mouseLocation's y as real",
      "",
      "set allScreens to current application's NSScreen's screens()",
      "set totalH to 0",
      "repeat with s in allScreens",
      "  set f to s's frame()",
      "  set sy to (f's origin's y) as real",
      "  set sh to (f's |size|'s height) as real",
      "  if (sy + sh) > totalH then set totalH to sy + sh",
      "end repeat",
      "",
      "repeat with s in allScreens",
      "  set f to s's frame()",
      "  set sx to (f's origin's x) as real",
      "  set sy to (f's origin's y) as real",
      "  set sw to (f's |size|'s width) as real",
      "  set sh to (f's |size|'s height) as real",
      "  if mx >= sx and mx < (sx + sw) and my >= sy and my < (sy + sh) then",
      "    set topY to (totalH - sy - sh) as integer",
      '    return (sx as integer as text) & "," & (topY as text) & "," & (sw as integer as text) & "," & (sh as integer as text)',
      "  end if",
      "end repeat",
      'return ""',
    ].join("\n");

    const { stdout } = await execFileP("osascript", ["-e", script], {
      timeout: 3000,
    });
    const parts = stdout.trim().split(",");
    if (parts.length === 4) {
      return {
        x: Number(parts[0]),
        y: Number(parts[1]),
        w: Number(parts[2]),
        h: Number(parts[3]),
      };
    }
  } catch {}
  return null;
}

async function captureWindowsScreen(outPath: string): Promise<void> {
  const script = `
    Add-Type -A System.Drawing
    Add-Type -A System.Windows.Forms
    $cursor = [System.Windows.Forms.Cursor]::Position
    $screen = [System.Windows.Forms.Screen]::FromPoint($cursor)
    $bounds = $screen.Bounds
    $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
    $bmp.Save('${outPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Jpeg)
    $g.Dispose()
    $bmp.Dispose()
  `;
  await execFileP("powershell", ["-NoProfile", "-Command", script], {
    timeout: 10_000,
  });
}

async function captureLinuxScreen(outPath: string): Promise<boolean> {
  for (const [cmd, cmdArgs] of [
    ["grim", [outPath]],
    ["scrot", [outPath]],
    ["import", ["-window", "root", outPath]],
  ] as [string, string[]][]) {
    try {
      await execFileP(cmd, cmdArgs, { timeout: 10_000 });
      return true;
    } catch {}
  }
  return false;
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
    const { stdout } = await execFileP("sips", ["-g", "pixelWidth", filePath], {
      timeout: 5000,
    });
    const match = stdout.match(/pixelWidth:\s*(\d+)/);
    if (!match) return;
    const currentWidth = Number(match[1]);
    if (currentWidth <= maxWidth) return;

    await execFileP("sips", ["--resampleWidth", String(maxWidth), filePath], {
      timeout: 5000,
    });
  } catch {}
}

/**
 * Hide or show the Freestyle app window via AppleScript. Used to prevent
 * the pill from appearing in screenshots and to let paste_text target the
 * correct app.
 */
export async function setFreestyleVisible(visible: boolean): Promise<void> {
  if (process.platform !== "darwin") return;
  try {
    const script = visible
      ? 'tell application "System Events" to set visible of process "Freestyle" to true'
      : 'tell application "System Events" to set visible of process "Freestyle" to false';
    await execFileP("osascript", ["-e", script], { timeout: 2000 });
  } catch {}
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

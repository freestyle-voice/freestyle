import { execFile } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { sleep } from "./util.js";

const execFileP = promisify(execFile);

/**
 * Longest-edge cap (in pixels) applied to captured screenshots before they are
 * sent to the model. 1568px matches Anthropic's recommended max edge — large
 * enough to read UI text, small enough to keep the base64 payload (and token
 * cost) reasonable and within provider image-size limits.
 */
const MAX_IMAGE_EDGE = 1568;

/**
 * Result of a screenshot capture. `text` is always present (a human-readable
 * summary shown in the UI and stored in history). `base64`/`mediaType` are
 * present on success and carry the actual image so the model can *see* it — the
 * caller attaches them as image content in the tool result.
 */
export interface ScreenshotResult {
  /** Human-readable summary (file path + size, or an error message). */
  text: string;
  /** Absolute path to the captured image on disk. */
  path?: string;
  /** Base-64 encoded image bytes (omitted on failure). */
  base64?: string;
  /** IANA media type of the image, e.g. `image/jpeg`. */
  mediaType?: string;
}

/**
 * Capture a screenshot of the display under the cursor. No parameters — the
 * tool is parameterless (like Anthropic's computer-use screenshot action).
 *
 * Returns the image bytes (base64) alongside a text summary so the model can
 * both see the screen and know the coordinate space. The file persists in the
 * temp directory for the session.
 */
export async function takeScreenshot(): Promise<ScreenshotResult> {
  const tmpPath = join(tmpdir(), `freestyle-screenshot-${Date.now()}.jpg`);
  const plat = process.platform;

  if (plat === "darwin") {
    await captureMacScreen(tmpPath);
  } else if (plat === "win32") {
    await captureWindowsScreen(tmpPath);
  } else {
    const captured = await captureLinuxScreen(tmpPath);
    if (!captured) {
      return {
        text: "Error: no screenshot tool found (install grim, scrot, or imagemagick)",
      };
    }
  }

  // Best-effort downscale so retina/multi-monitor captures don't blow past
  // provider image-size limits. Failures are non-fatal — we still send the
  // full-resolution capture.
  await downscaleImage(tmpPath, plat);

  // Report file size so the model knows the capture succeeded.
  let sizeInfo = "";
  try {
    const bytes = statSync(tmpPath).size;
    sizeInfo = ` (${(bytes / 1_000_000).toFixed(1)} MB)`;
  } catch {}

  let base64: string | undefined;
  try {
    base64 = readFileSync(tmpPath).toString("base64");
  } catch {
    // Captured but couldn't read the file back — no image to attach. The temp
    // path stays in the structured `path` field only; it is deliberately kept
    // out of `text` so the (voice) agent never reads the filename aloud.
    return {
      text: `Screenshot captured${sizeInfo} but could not be attached.`,
      path: tmpPath,
    };
  }

  // NOTE: `text` must not include the temp file path. It is surfaced to the
  // model (as the caption beside the image) and replayed from history on later
  // turns, so a path here would get spoken/spelled out by the voice agent.
  return {
    text: `Screenshot captured${sizeInfo}.`,
    path: tmpPath,
    base64,
    mediaType: "image/jpeg",
  };
}

/**
 * Downscale the captured JPEG in place so its longest edge is at most
 * {@link MAX_IMAGE_EDGE}px, using whatever tool ships with the OS. All failures
 * are swallowed — a too-large image is better than a failed capture.
 */
async function downscaleImage(
  path: string,
  plat: NodeJS.Platform,
): Promise<void> {
  try {
    if (plat === "darwin") {
      // `sips` is built into macOS. --resampleHeightWidthMax caps the longest
      // edge while preserving aspect ratio.
      await execFileP(
        "sips",
        ["--resampleHeightWidthMax", String(MAX_IMAGE_EDGE), path],
        { timeout: 8000 },
      );
      return;
    }
    // Windows resizes inside the capture script; here we only handle Linux and
    // any other platform that has ImageMagick available.
    if (plat !== "win32") {
      for (const cmd of ["magick", "convert"]) {
        try {
          await execFileP(
            cmd,
            [path, "-resize", `${MAX_IMAGE_EDGE}x${MAX_IMAGE_EDGE}>`, path],
            { timeout: 8000 },
          );
          return;
        } catch {}
      }
    }
  } catch {}
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
  await setFreestyleVisible(false);
  await sleep(150);

  try {
    const script = `
      Add-Type -A System.Drawing
      Add-Type -A System.Windows.Forms
      $cursor = [System.Windows.Forms.Cursor]::Position
      $screen = [System.Windows.Forms.Screen]::FromPoint($cursor)
      $bounds = $screen.Bounds
      $bmp = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      $g.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
      $g.Dispose()
      $max = ${MAX_IMAGE_EDGE}
      $scale = [Math]::Min(1.0, $max / [Math]::Max($bmp.Width, $bmp.Height))
      if ($scale -lt 1.0) {
        $w = [int]($bmp.Width * $scale)
        $h = [int]($bmp.Height * $scale)
        $resized = New-Object System.Drawing.Bitmap($w, $h)
        $rg = [System.Drawing.Graphics]::FromImage($resized)
        $rg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $rg.DrawImage($bmp, 0, 0, $w, $h)
        $rg.Dispose()
        $bmp.Dispose()
        $bmp = $resized
      }
      $bmp.Save('${outPath.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Jpeg)
      $bmp.Dispose()
    `;
    await execFileP("powershell", ["-NoProfile", "-Command", script], {
      timeout: 10_000,
    });
  } finally {
    await setFreestyleVisible(true);
  }
}

async function captureLinuxScreen(outPath: string): Promise<boolean> {
  await setFreestyleVisible(false);
  await sleep(150);

  try {
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
  } finally {
    await setFreestyleVisible(true);
  }
}

/**
 * Hide or show the Freestyle app window. Cross-platform: uses AppleScript on
 * macOS, PowerShell on Windows, and wmctrl/xdotool on Linux. Used to prevent
 * the pill from appearing in screenshots and to let paste_text target the
 * correct app.
 */
export async function setFreestyleVisible(visible: boolean): Promise<void> {
  const plat = process.platform;
  try {
    if (plat === "darwin") {
      const script = visible
        ? 'tell application "System Events" to set visible of process "Freestyle" to true'
        : 'tell application "System Events" to set visible of process "Freestyle" to false';
      await execFileP("osascript", ["-e", script], { timeout: 2000 });
    } else if (plat === "win32") {
      // Use PowerShell to find the Freestyle window and minimize/restore it
      const script = visible
        ? `
          Add-Type @"
            using System; using System.Runtime.InteropServices;
            public class W { [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c); }
"@
          $p = Get-Process -Name Freestyle -ErrorAction SilentlyContinue
          if ($p) { foreach ($h in @($p.MainWindowHandle)) { [W]::ShowWindow($h, 9) | Out-Null } }
        `
        : `
          Add-Type @"
            using System; using System.Runtime.InteropServices;
            public class W { [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c); }
"@
          $p = Get-Process -Name Freestyle -ErrorAction SilentlyContinue
          if ($p) { foreach ($h in @($p.MainWindowHandle)) { [W]::ShowWindow($h, 0) | Out-Null } }
        `;
      await execFileP("powershell", ["-NoProfile", "-Command", script], {
        timeout: 3000,
      });
    } else {
      // Linux: try wmctrl, then xdotool
      if (visible) {
        try {
          await execFileP(
            "wmctrl",
            ["-r", "Freestyle", "-b", "remove,hidden"],
            {
              timeout: 2000,
            },
          );
          return;
        } catch {}
        try {
          await execFileP(
            "xdotool",
            ["search", "--name", "Freestyle", "windowactivate"],
            {
              timeout: 2000,
            },
          );
        } catch {}
      } else {
        try {
          await execFileP("wmctrl", ["-r", "Freestyle", "-b", "add,hidden"], {
            timeout: 2000,
          });
          return;
        } catch {}
        try {
          await execFileP(
            "xdotool",
            ["search", "--name", "Freestyle", "windowminimize"],
            {
              timeout: 2000,
            },
          );
        } catch {}
      }
    }
  } catch {}
}

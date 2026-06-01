import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  getManagedMlxWorkerPath,
  isAppleSiliconMac,
  MLX_UNSUPPORTED_PLATFORM_REASON,
} from "./constants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedPython: string | null | undefined;
let cachedMlxAudio: boolean | undefined;
let cachedWorkerPath: string | null | undefined;

function uvPythonCandidates(): string[] {
  const root = join(homedir(), ".local", "share", "uv", "python");
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const py = join(root, entry.name, "bin", "python3");
    if (existsSync(py)) out.push(py);
  }
  return out.sort().reverse();
}

function projectVenvCandidates(): string[] {
  const home = homedir();
  const out: string[] = [];
  const devRoot = join(home, "Developer");
  if (!existsSync(devRoot)) return out;

  for (const entry of readdirSync(devRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const py = join(devRoot, entry.name, ".venv", "bin", "python");
    if (existsSync(py)) out.push(py);
    const nested = join(devRoot, entry.name);
    if (!existsSync(nested)) continue;
    try {
      for (const sub of readdirSync(nested, { withFileTypes: true })) {
        if (!sub.isDirectory()) continue;
        const subPy = join(nested, sub.name, ".venv", "bin", "python");
        if (existsSync(subPy)) out.push(subPy);
      }
    } catch {
      // ignore unreadable trees
    }
  }
  return out;
}

function buildPythonCandidates(): string[] {
  const home = homedir();
  const seen = new Set<string>();
  const ordered: string[] = [];

  const add = (path: string | undefined) => {
    if (!path || seen.has(path)) return;
    seen.add(path);
    ordered.push(path);
  };

  add(process.env.FREESTYLE_PYTHON);
  add(process.env.PYTHON);
  for (const py of projectVenvCandidates()) add(py);
  for (const py of uvPythonCandidates()) add(py);
  add(join(home, ".pyenv", "shims", "python3"));
  add("/opt/homebrew/bin/python3.12");
  add("/opt/homebrew/bin/python3");
  add("/usr/local/bin/python3");
  add("python3");
  add("python");

  return ordered;
}

function isPython3(cmd: string): boolean {
  if (cmd.includes("/") && !existsSync(cmd)) return false;
  try {
    const out = execFileSync(cmd, ["--version"], {
      encoding: "utf8",
      timeout: 5_000,
      env: process.env,
    });
    return out.includes("Python 3.");
  } catch {
    return false;
  }
}

function probeMlxAudio(cmd: string): boolean {
  try {
    execFileSync(
      cmd,
      [
        "-c",
        "import mlx_audio; import mlx; import numpy; import huggingface_hub",
      ],
      {
        stdio: "ignore",
        timeout: 30_000,
        env: process.env,
      },
    );
    return true;
  } catch {
    return false;
  }
}

export function resetPythonProbe(): void {
  cachedPython = undefined;
  cachedMlxAudio = undefined;
  cachedWorkerPath = undefined;
  resetMlxAsrScriptPathCache();
}

/** Prefer a Python that already has mlx-audio; otherwise the first Python 3 found. */
export function findPythonExecutable(): string | null {
  if (cachedPython !== undefined) return cachedPython;

  let fallback: string | null = null;
  for (const cmd of buildPythonCandidates()) {
    if (!isPython3(cmd)) continue;
    if (!fallback) fallback = cmd;
    if (probeMlxAudio(cmd)) {
      cachedPython = cmd;
      cachedMlxAudio = true;
      return cmd;
    }
  }

  cachedPython = fallback;
  cachedMlxAudio = fallback ? false : undefined;
  return fallback;
}

export function isMlxAudioInstalled(python = findPythonExecutable()): boolean {
  if (!python) {
    cachedMlxAudio = false;
    return false;
  }
  if (cachedMlxAudio !== undefined && python === cachedPython) {
    return cachedMlxAudio;
  }
  cachedMlxAudio = probeMlxAudio(python);
  return cachedMlxAudio;
}

export function describeMlxSetupBlocker(): string | null {
  if (!isAppleSiliconMac()) return MLX_UNSUPPORTED_PLATFORM_REASON;
  const workerPath = getMlxAsrWorkerPath();
  if (workerPath && existsSync(workerPath)) return null;

  const python = findPythonExecutable();
  if (!python) {
    return "Bundled MLX ASR worker or Python 3 not found. Set FREESTYLE_MLX_ASR_WORKER or FREESTYLE_PYTHON.";
  }
  if (!existsSync(getMlxAsrServerScriptPath())) {
    return "MLX ASR server script missing from this install.";
  }
  if (!isMlxAudioInstalled(python)) {
    return `MLX ASR Python dependencies are not installed for ${python}. Run: ${python} -m pip install mlx-audio`;
  }
  return null;
}

function mlxAsrWorkerCandidates(): string[] {
  const candidates: string[] = [];

  const add = (path: string | undefined) => {
    if (!path || candidates.includes(path)) return;
    candidates.push(path);
  };

  add(process.env.FREESTYLE_MLX_ASR_WORKER);
  add(getManagedMlxWorkerPath());

  const electronProcess = process as NodeJS.Process & {
    resourcesPath?: string;
  };
  if (electronProcess.resourcesPath) {
    add(
      join(
        electronProcess.resourcesPath,
        "mlx-asr",
        "mlx_asr_worker",
        "mlx_asr_worker",
      ),
    );
    add(join(electronProcess.resourcesPath, "mlx-asr", "mlx_asr_worker"));
  }

  add(
    join(
      process.cwd(),
      "resources",
      "mlx-asr",
      "mlx_asr_worker",
      "mlx_asr_worker",
    ),
  );
  add(join(process.cwd(), "resources", "mlx-asr", "mlx_asr_worker"));
  add(join(process.cwd(), "dist", "mlx_asr_worker", "mlx_asr_worker"));
  add(join(process.cwd(), "dist", "mlx-asr", "mlx_asr_worker"));
  add(join(process.cwd(), "scripts", "dist", "mlx_asr_worker"));
  add(join(process.cwd(), "../../dist/mlx_asr_worker/mlx_asr_worker"));
  add(join(process.cwd(), "../../dist/mlx-asr/mlx_asr_worker"));

  let dir = __dirname;
  for (let depth = 0; depth < 12; depth++) {
    add(join(dir, "dist", "mlx_asr_worker", "mlx_asr_worker"));
    add(join(dir, "dist", "mlx-asr", "mlx_asr_worker"));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return candidates;
}

/** Resolved path to a frozen standalone MLX ASR worker executable, when bundled. */
export function getMlxAsrWorkerPath(): string {
  if (cachedWorkerPath !== undefined) return cachedWorkerPath ?? "";

  for (const candidate of mlxAsrWorkerCandidates()) {
    if (existsSync(candidate)) {
      cachedWorkerPath = candidate;
      return candidate;
    }
  }

  cachedWorkerPath = null;
  return "";
}

let cachedScriptPath: string | null | undefined;

function mlxAsrScriptCandidates(): string[] {
  const candidates: string[] = [];

  const add = (path: string | undefined) => {
    if (!path || candidates.includes(path)) return;
    candidates.push(path);
  };

  add(process.env.FREESTYLE_MLX_ASR_SCRIPT);

  const electronProcess = process as NodeJS.Process & {
    resourcesPath?: string;
  };
  if (electronProcess.resourcesPath) {
    add(join(electronProcess.resourcesPath, "mlx-asr", "mlx_asr_server.py"));
  }

  add(join(process.cwd(), "resources", "mlx-asr", "mlx_asr_server.py"));
  add(join(process.cwd(), "scripts", "mlx_asr_server.py"));
  add(join(process.cwd(), "../../scripts", "mlx_asr_server.py"));
  add(join(__dirname, "../../../../scripts", "mlx_asr_server.py"));
  add(join(__dirname, "../../../../../scripts", "mlx_asr_server.py"));

  let dir = __dirname;
  for (let depth = 0; depth < 12; depth++) {
    add(join(dir, "scripts", "mlx_asr_server.py"));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return candidates;
}

/** Resolved path to scripts/mlx_asr_server.py (bundled in Electron or monorepo). */
export function getMlxAsrServerScriptPath(): string {
  if (cachedScriptPath !== undefined) return cachedScriptPath ?? "";

  for (const candidate of mlxAsrScriptCandidates()) {
    if (existsSync(candidate)) {
      cachedScriptPath = candidate;
      return candidate;
    }
  }

  cachedScriptPath = null;
  return mlxAsrScriptCandidates()[0] ?? "";
}

export function resetMlxAsrScriptPathCache(): void {
  cachedScriptPath = undefined;
}

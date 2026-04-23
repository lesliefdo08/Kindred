import fs from "node:fs/promises";
import path from "node:path";
import { exec as execCb } from "node:child_process";
import { execFile as execFileCb } from "node:child_process";
import { promisify } from "node:util";
import { SupportedLanguage } from "../types";
import { ensureCacheDirectories, loadManifest, saveManifest } from "./dependencyCache";
import { parseDependencies } from "./dependencyParser";

const exec = promisify(execCb);
const execFile = promisify(execFileCb);

export type DependencyInstallMode = "prompt" | "auto" | "off";

export interface DependencyLogger {
  log: (step: string, detail: string) => void;
}

export interface DependencyConfirmRequest {
  language: SupportedLanguage;
  packages: string[];
  cachePath: string;
}

export interface DependencyResolutionResult {
  ok: boolean;
  requested: string[];
  missing: string[];
  installed: string[];
  cachePath: string;
  env: NodeJS.ProcessEnv;
  message?: string;
}

export interface DependencyManagerOptions {
  language: SupportedLanguage;
  code: string;
  cacheRoot: string;
  workDir: string;
  installMode: DependencyInstallMode;
  pythonCommand?: { command: string; argsPrefix: string[] };
  confirmInstall?: (request: DependencyConfirmRequest) => Promise<boolean>;
  logger?: DependencyLogger;
}

function log(logger: DependencyLogger | undefined, step: string, detail: string): void {
  logger?.log(step, detail);
}

function isDependencyAvailableOnPython(
  moduleName: string,
  pythonPath: string,
  pythonCommand?: { command: string; argsPrefix: string[] }
): Promise<boolean> {
  const script = [
    "import importlib.util",
    "import sys",
    `sys.path.insert(0, r'''${pythonPath}''')`,
    `print(1 if importlib.util.find_spec('${moduleName.replace(/'/g, "\\'")}') else 0)`
  ].join("; ");

  const runtime = pythonCommand ?? { command: "python", argsPrefix: [] };
  const args = [...runtime.argsPrefix, "-c", script];

  return execFile(runtime.command, args)
    .then(({ stdout }) => stdout.trim() === "1")
    .catch(() => false);
}

async function isNodeDependencyAvailable(packageName: string, nodeRoot: string): Promise<boolean> {
  const packagePath = packageName.startsWith("@")
    ? path.join(nodeRoot, "node_modules", packageName)
    : path.join(nodeRoot, "node_modules", packageName);

  try {
    const stats = await fs.stat(packagePath);
    return stats.isDirectory() || stats.isFile();
  } catch {
    return false;
  }
}

async function installPythonDependencies(
  packages: string[],
  pythonTarget: string,
  logger?: DependencyLogger,
  pythonCommand?: { command: string; argsPrefix: string[] }
): Promise<void> {
  if (packages.length === 0) {
    return;
  }

  log(logger, "dependency-install", `Installing Python package(s): ${packages.join(", ")}`);
  const runtime = pythonCommand ?? { command: "python", argsPrefix: [] };
  const installArgs = [...runtime.argsPrefix, "-m", "pip", "install", "--disable-pip-version-check", "--no-input", "--target", pythonTarget, ...packages];
  const { stdout, stderr } = await execFile(runtime.command, installArgs, { maxBuffer: 1024 * 1024 * 2 });
  if (stdout.trim()) {
    log(logger, "dependency-install-output", stdout.trim());
  }
  if (stderr.trim()) {
    log(logger, "dependency-install-output", stderr.trim());
  }
}

async function installNodeDependencies(packages: string[], nodeRoot: string, logger?: DependencyLogger): Promise<void> {
  if (packages.length === 0) {
    return;
  }

  const packageJsonPath = path.join(nodeRoot, "package.json");
  try {
    await fs.access(packageJsonPath);
  } catch {
    await fs.writeFile(packageJsonPath, JSON.stringify({ name: "kindred-node-cache", private: true, version: "1.0.0" }, null, 2), "utf-8");
  }

  log(logger, "dependency-install", `Installing Node package(s): ${packages.join(", ")}`);
  const installCommand = `npm install --prefix "${nodeRoot}" --no-package-lock --no-save ${packages.map((pkg) => `"${pkg}"`).join(" ")}`;
  const { stdout, stderr } = await exec(installCommand, { maxBuffer: 1024 * 1024 * 2 });
  if (stdout.trim()) {
    log(logger, "dependency-install-output", stdout.trim());
  }
  if (stderr.trim()) {
    log(logger, "dependency-install-output", stderr.trim());
  }
}

async function ensureNodeModuleLink(workDir: string, nodeRoot: string): Promise<void> {
  const linkPath = path.join(workDir, "node_modules");
  const targetPath = path.join(nodeRoot, "node_modules");
  try {
    await fs.access(linkPath);
  } catch {
    await fs.symlink(targetPath, linkPath, "junction");
  }
}

export async function prepareDependencies(options: DependencyManagerOptions): Promise<DependencyResolutionResult> {
  const logger = options.logger;
  const requested = parseDependencies(options.language, options.code);
  log(logger, "dependency-scan", requested.length > 0 ? `Detected dependencies: ${requested.join(", ")}` : "No external dependencies detected");

  if (requested.length === 0) {
    return {
      ok: true,
      requested: [],
      missing: [],
      installed: [],
      cachePath: options.cacheRoot,
      env: {}
    };
  }

  const { pythonTarget, nodeRoot } = await ensureCacheDirectories(options.cacheRoot);
  const manifest = await loadManifest(options.cacheRoot);
  const installed: string[] = [];
  const missing: string[] = [];

  if (options.language === "python") {
    for (const dependency of requested) {
      const available = await isDependencyAvailableOnPython(dependency, pythonTarget, options.pythonCommand);
      if (!available) {
        missing.push(dependency);
      } else {
        installed.push(dependency);
      }
    }
  }

  if (options.language === "javascript") {
    for (const dependency of requested) {
      const available = manifest.node.includes(dependency) || await isNodeDependencyAvailable(dependency, nodeRoot);
      if (!available) {
        missing.push(dependency);
      } else {
        installed.push(dependency);
      }
    }
  }

  if (missing.length === 0) {
    log(logger, "dependency-cache", `All dependencies already available: ${requested.join(", ")}`);
    const env: NodeJS.ProcessEnv = {};
    if (options.language === "python") {
      env.PYTHONPATH = pythonTarget;
    }
    return {
      ok: true,
      requested,
      missing: [],
      installed,
      cachePath: options.cacheRoot,
      env
    };
  }

  log(logger, "dependency-missing", `Missing dependencies: ${missing.join(", ")}`);

  if (options.installMode === "off") {
    return {
      ok: false,
      requested,
      missing,
      installed,
      cachePath: options.cacheRoot,
      env: {},
      message: `Missing dependency(ies): ${missing.join(", ")}. Automatic installation is disabled.`
    };
  }

  if (options.installMode === "prompt" && options.confirmInstall) {
    const approved = await options.confirmInstall({ language: options.language, packages: missing, cachePath: options.cacheRoot });
    if (!approved) {
      return {
        ok: false,
        requested,
        missing,
        installed,
        cachePath: options.cacheRoot,
        env: {},
        message: `Installation cancelled for: ${missing.join(", ")}.`
      };
    }
  }

  if (options.language === "python") {
    await installPythonDependencies(missing, pythonTarget, logger, options.pythonCommand);
    for (const dependency of missing) {
      manifest.python = manifest.python.filter((item) => item !== dependency);
      manifest.python.push(dependency);
    }
  }

  if (options.language === "javascript") {
    await installNodeDependencies(missing, nodeRoot, logger);
    await ensureNodeModuleLink(options.workDir, nodeRoot);
    for (const dependency of missing) {
      manifest.node = manifest.node.filter((item) => item !== dependency);
      manifest.node.push(dependency);
    }
  }

  await saveManifest(options.cacheRoot, manifest);
  const env: NodeJS.ProcessEnv = {};
  if (options.language === "python") {
    env.PYTHONPATH = pythonTarget;
  }

  return {
    ok: true,
    requested,
    missing: [],
    installed: [...installed, ...missing],
    cachePath: options.cacheRoot,
    env
  };
}

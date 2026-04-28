import fs from "node:fs/promises";
import path from "node:path";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execCb);

export type RuntimeSource = "local" | "managed";

export type RuntimeKey = "python" | "node" | "cCompiler" | "cppCompiler" | "javaCompiler" | "javaRuntime";

export interface RuntimeCommand {
  command: string;
  argsPrefix: string[];
  label?: string;
}

export interface ResolvedRuntime extends RuntimeCommand {
  key: RuntimeKey;
  source: RuntimeSource;
}

export interface RuntimeAttempt {
  key: RuntimeKey;
  source: "local" | "managed" | "container";
  command: string;
  success: boolean;
  detail: string;
}

export interface RuntimeResolutionResult {
  ok: boolean;
  resolved: Partial<Record<RuntimeKey, ResolvedRuntime>>;
  missingKeys: RuntimeKey[];
  attempts: RuntimeAttempt[];
  dockerAvailable: boolean;
}

interface ManagedRuntimeConfig {
  python?: RuntimeCommand;
  node?: RuntimeCommand;
  cCompiler?: RuntimeCommand;
  cppCompiler?: RuntimeCommand;
  javaCompiler?: RuntimeCommand;
  javaRuntime?: RuntimeCommand;
}

interface RuntimeManifestEntry {
  path: string;
  argsPrefix?: string[];
  label?: string;
}

interface RuntimeManifest {
  runtimes?: Partial<Record<RuntimeKey, RuntimeManifestEntry[]>>;
}

export interface ResolveRuntimeOptions {
  appRoot: string;
  managedRuntimeRoot: string;
  resourceRoot: string;
}

const localCandidates: Record<RuntimeKey, RuntimeCommand[]> = {
  python: [
    { command: "py", argsPrefix: ["-3"], label: "Windows Python Launcher" },
    { command: "python", argsPrefix: [], label: "Local Python" }
  ],
  node: [{ command: "node", argsPrefix: [], label: "Local Node.js" }],
  cCompiler: [
    { command: "gcc", argsPrefix: [], label: "Local GCC" },
    { command: "clang", argsPrefix: [], label: "Local Clang" },
    { command: "cc", argsPrefix: [], label: "Local C compiler" }
  ],
  cppCompiler: [
    { command: "g++", argsPrefix: [], label: "Local G++" },
    { command: "clang++", argsPrefix: [], label: "Local Clang++" },
    { command: "c++", argsPrefix: [], label: "Local C++ compiler" }
  ],
  javaCompiler: [{ command: "javac", argsPrefix: [], label: "Local Java compiler" }],
  javaRuntime: [{ command: "java", argsPrefix: [], label: "Local Java runtime" }]
};

function expandRuntimePath(templatePath: string, appRoot: string): string {
  const exe = process.platform === "win32" ? ".exe" : "";
  const mingwTriplet = process.arch === "x64" ? "x86_64-w64-mingw32" : "i686-w64-mingw32";
  const expanded = templatePath
    .replace(/\$\{platform\}/g, process.platform)
    .replace(/\$\{arch\}/g, process.arch)
    .replace(/\$\{mingwTriplet\}/g, mingwTriplet)
    .replace(/\$\{exe\}/g, exe)
    .replace(/^\.\//, "");

  if (path.isAbsolute(expanded)) {
    return expanded;
  }

  return path.resolve(appRoot, expanded);
}

function resourcePaths(resourceRoots: string[]): string[] {
  return resourceRoots.flatMap((resourceRoot) => [
    path.join(resourceRoot, "resources", "runtimes", "tcc"),
    path.join(resourceRoot, "runtimes", "tcc")
  ]);
}

function getBundledTinyccCandidates(resourceRoot: string): RuntimeCommand[] {
  if (process.platform !== "win32") {
    return [];
  }

  const exe = process.platform === "win32" ? "tcc.exe" : "tcc";
  const archFolder = process.arch === "x64" ? "win64" : "win32";
  const candidates: RuntimeCommand[] = [];

  for (const basePath of resourcePaths([resourceRoot, path.dirname(resourceRoot)])) {
    const relativeCandidates = [
      ["bin", archFolder, exe],
      ["bin", archFolder, "bin", exe],
      ["bin", exe],
      [archFolder, exe],
      [archFolder, "bin", exe],
      [exe]
    ];

    for (const relativeParts of relativeCandidates) {
      candidates.push({
        command: path.join(basePath, ...relativeParts),
        argsPrefix: [],
        label: "Bundled TinyCC compiler"
      });
    }
  }

  return candidates;
}

async function commandExists(command: string): Promise<boolean> {
  const normalized = command.trim();

  if (normalized.includes("/") || normalized.includes("\\")) {
    try {
      await fs.access(normalized);
      return true;
    } catch {
      return false;
    }
  }

  const checkCommand = process.platform === "win32" ? `where ${normalized}` : `command -v ${normalized}`;
  try {
    await exec(checkCommand, { timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}

async function readManagedConfig(managedRuntimeRoot: string): Promise<ManagedRuntimeConfig> {
  const envPath = process.env.KINDRED_MANAGED_RUNTIME_CONFIG;
  const configPath = envPath && envPath.trim().length > 0 ? envPath : path.join(managedRuntimeRoot, "runtimes.json");

  try {
    const raw = await fs.readFile(configPath, "utf-8");
    return JSON.parse(raw) as ManagedRuntimeConfig;
  } catch {
    return {};
  }
}

async function readManagedManifest(appRoot: string): Promise<RuntimeManifest> {
  const envPath = process.env.KINDRED_MANAGED_RUNTIME_MANIFEST;
  const manifestPath = envPath && envPath.trim().length > 0 ? envPath : path.join(appRoot, "managed-runtimes", "manifest.json");

  try {
    const raw = await fs.readFile(manifestPath, "utf-8");
    return JSON.parse(raw) as RuntimeManifest;
  } catch {
    return {};
  }
}

function getManifestCandidates(key: RuntimeKey, manifest: RuntimeManifest, appRoot: string): RuntimeCommand[] {
  const entries = manifest.runtimes?.[key] ?? [];
  return entries.map((entry) => ({
    command: expandRuntimePath(entry.path, appRoot),
    argsPrefix: entry.argsPrefix ?? [],
    label: entry.label ?? "Bundled runtime"
  }));
}

export async function resolveRuntimes(requiredKeys: RuntimeKey[], options: ResolveRuntimeOptions): Promise<RuntimeResolutionResult> {
  const attempts: RuntimeAttempt[] = [];
  const resolved: Partial<Record<RuntimeKey, ResolvedRuntime>> = {};
  const uniqueRequired = [...new Set(requiredKeys)];
  const managedConfig = await readManagedConfig(options.managedRuntimeRoot);
  const manifest = await readManagedManifest(options.appRoot);

  for (const key of uniqueRequired) {
    let found = false;

    for (const candidate of localCandidates[key] ?? []) {
      const exists = await commandExists(candidate.command);
      attempts.push({
        key,
        source: "local",
        command: [candidate.command, ...candidate.argsPrefix].join(" "),
        success: exists,
        detail: exists ? candidate.label ?? "Found local runtime" : "Not available on host"
      });

      if (exists) {
        resolved[key] = {
          ...candidate,
          key,
          source: "local"
        };
        found = true;
        break;
      }
    }

    if (found) {
      continue;
    }

    const managedCandidates: RuntimeCommand[] = [];
    if (key === "cCompiler") {
      managedCandidates.push(...getBundledTinyccCandidates(options.resourceRoot));
    }

    const configured = managedConfig[key];
    if (configured) {
      managedCandidates.push({
        command: configured.command,
        argsPrefix: configured.argsPrefix ?? [],
        label: configured.label ?? "Configured managed runtime"
      });
    }

    managedCandidates.push(...getManifestCandidates(key, manifest, options.appRoot));

    if (managedCandidates.length === 0) {
      attempts.push({
        key,
        source: "managed",
        command: "(not configured)",
        success: false,
        detail: "No managed runtime configured"
      });
      continue;
    }

    for (const candidate of managedCandidates) {
      const exists = await commandExists(candidate.command);
      attempts.push({
        key,
        source: "managed",
        command: [candidate.command, ...candidate.argsPrefix].join(" "),
        success: exists,
        detail: exists ? candidate.label ?? "Found managed runtime" : "Managed runtime candidate not found"
      });

      if (exists) {
        resolved[key] = {
          key,
          source: "managed",
          command: candidate.command,
          argsPrefix: candidate.argsPrefix,
          label: candidate.label
        };
        found = true;
        break;
      }
    }
  }

  const missingKeys = uniqueRequired.filter((key) => !resolved[key]);
  const dockerAvailable = await commandExists("docker");
  attempts.push({
    key: uniqueRequired[0] ?? "python",
    source: "container",
    command: "docker",
    success: dockerAvailable,
    detail: dockerAvailable ? "Docker command is available for fallback" : "Docker command not found"
  });

  return {
    ok: missingKeys.length === 0,
    resolved,
    missingKeys,
    attempts,
    dockerAvailable
  };
}

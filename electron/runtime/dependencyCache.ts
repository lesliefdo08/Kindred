import fs from "node:fs/promises";
import path from "node:path";

const manifestFileName = "manifest.json";

export interface DependencyManifest {
  python: string[];
  node: string[];
}

const defaultManifest: DependencyManifest = {
  python: [],
  node: []
};

export async function ensureCacheDirectories(cacheRoot: string): Promise<{ pythonTarget: string; nodeRoot: string }> {
  const pythonTarget = path.join(cacheRoot, "python-packages");
  const nodeRoot = path.join(cacheRoot, "node-cache");
  await fs.mkdir(pythonTarget, { recursive: true });
  await fs.mkdir(nodeRoot, { recursive: true });
  return { pythonTarget, nodeRoot };
}

export async function loadManifest(cacheRoot: string): Promise<DependencyManifest> {
  const manifestPath = path.join(cacheRoot, manifestFileName);
  try {
    const raw = await fs.readFile(manifestPath, "utf-8");
    const parsed = JSON.parse(raw) as DependencyManifest;
    return {
      python: Array.isArray(parsed.python) ? parsed.python : [],
      node: Array.isArray(parsed.node) ? parsed.node : []
    };
  } catch {
    return { ...defaultManifest };
  }
}

export async function saveManifest(cacheRoot: string, manifest: DependencyManifest): Promise<void> {
  const manifestPath = path.join(cacheRoot, manifestFileName);
  await fs.mkdir(cacheRoot, { recursive: true });
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf-8");
}

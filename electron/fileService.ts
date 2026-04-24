import { dialog } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { detectLanguage } from "./languageDetector";
import { ExplorerNode, OpenFileResult, OpenFolderResult, SaveFileRequest, SaveFileResult } from "./types";

const ignoredDirectoryNames = new Set([".git", "node_modules", "dist", "dist-electron", "release"]);
const maxEntries = 1500;

function compareNodes(left: ExplorerNode, right: ExplorerNode): number {
  if (left.type !== right.type) {
    return left.type === "directory" ? -1 : 1;
  }
  return left.name.localeCompare(right.name);
}

async function readFolderEntries(rootPath: string, depth = 0, counter = { count: 0 }): Promise<ExplorerNode[]> {
  if (depth > 6 || counter.count >= maxEntries) {
    return [];
  }

  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const nodes: ExplorerNode[] = [];

  for (const entry of entries) {
    if (counter.count >= maxEntries) {
      break;
    }

    if (entry.name.startsWith(".")) {
      continue;
    }

    if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      counter.count += 1;
      nodes.push({
        name: entry.name,
        path: entryPath,
        type: "directory",
        children: await readFolderEntries(entryPath, depth + 1, counter)
      });
      continue;
    }

    if (entry.isFile()) {
      counter.count += 1;
      nodes.push({
        name: entry.name,
        path: entryPath,
        type: "file"
      });
    }
  }

  return nodes.sort(compareNodes);
}

export async function openFile(): Promise<OpenFileResult | null> {
  const picked = await dialog.showOpenDialog({
    title: "Open File",
    properties: ["openFile"],
    filters: [
      { name: "Code", extensions: ["py", "c", "cpp", "cc", "cxx", "js", "mjs", "java", "txt"] },
      { name: "All Files", extensions: ["*"] }
    ]
  });

  if (picked.canceled || picked.filePaths.length === 0) {
    return null;
  }

  const filePath = picked.filePaths[0];
  const content = await fs.readFile(filePath, "utf-8");
  const { language } = detectLanguage(filePath, content);

  return {
    filePath,
    fileName: path.basename(filePath),
    content,
    language
  };
}

export async function openFolder(): Promise<OpenFolderResult | null> {
  const picked = await dialog.showOpenDialog({
    title: "Open Folder",
    properties: ["openDirectory"]
  });

  if (picked.canceled || picked.filePaths.length === 0) {
    return null;
  }

  const rootPath = picked.filePaths[0];
  const entries = await readFolderEntries(rootPath);

  return {
    rootPath,
    rootName: path.basename(rootPath),
    entries
  };
}

export async function readWorkspaceFile(filePath: string): Promise<OpenFileResult | null> {
  const content = await fs.readFile(filePath, "utf-8");
  const { language } = detectLanguage(filePath, content);

  return {
    filePath,
    fileName: path.basename(filePath),
    content,
    language
  };
}

export async function saveFile(request: SaveFileRequest): Promise<SaveFileResult | null> {
  const requestedPath = request.filePath;
  let targetPath = requestedPath;

  if (!targetPath) {
    const saveResult = await dialog.showSaveDialog({
      title: "Save File",
      filters: [
        { name: "Code", extensions: [request.suggestedExtension ?? "txt"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return null;
    }

    targetPath = saveResult.filePath;
  }

  await fs.writeFile(targetPath, request.content, "utf-8");

  return {
    filePath: targetPath,
    fileName: path.basename(targetPath)
  };
}

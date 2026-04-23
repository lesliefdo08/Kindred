import { dialog } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { detectLanguage } from "./languageDetector";
import { OpenFileResult, SaveFileRequest, SaveFileResult } from "./types";

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

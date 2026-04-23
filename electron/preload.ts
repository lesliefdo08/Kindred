import { contextBridge, ipcRenderer } from "electron";
import {
  DetectionResult,
  OpenFileResult,
  RunCodeRequest,
  RunCodeResult,
  SaveFileRequest,
  SaveFileResult
} from "./types";

const api = {
  openFile: (): Promise<OpenFileResult | null> => ipcRenderer.invoke("file:open"),
  saveFile: (request: SaveFileRequest): Promise<SaveFileResult | null> => ipcRenderer.invoke("file:save", request),
  detectLanguage: (filePath: string | null, code: string): Promise<DetectionResult> =>
    ipcRenderer.invoke("language:detect", { filePath, code }),
  runCode: (request: RunCodeRequest): Promise<RunCodeResult> => ipcRenderer.invoke("runtime:run", request),
  stopRun: (): Promise<{ stopped: boolean }> => ipcRenderer.invoke("runtime:stop")
};

contextBridge.exposeInMainWorld("kindredAPI", api);

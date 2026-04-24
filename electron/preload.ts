import { contextBridge, ipcRenderer } from "electron";
import {
  DetectionResult,
  MenuAction,
  OpenFileResult,
  OpenFolderResult,
  RunCodeRequest,
  RunCodeResult,
  RuntimeStatusResult,
  SaveFileRequest,
  SaveFileResult
} from "./types";

const api = {
  openFile: (): Promise<OpenFileResult | null> => ipcRenderer.invoke("file:open"),
  openFolder: (): Promise<OpenFolderResult | null> => ipcRenderer.invoke("file:openFolder"),
  readWorkspaceFile: (filePath: string): Promise<OpenFileResult | null> => ipcRenderer.invoke("file:readWorkspaceFile", filePath),
  saveFile: (request: SaveFileRequest): Promise<SaveFileResult | null> => ipcRenderer.invoke("file:save", request),
  detectLanguage: (filePath: string | null, code: string): Promise<DetectionResult> =>
    ipcRenderer.invoke("language:detect", { filePath, code }),
  runCode: (request: RunCodeRequest): Promise<RunCodeResult> => ipcRenderer.invoke("runtime:run", request),
  stopRun: (): Promise<{ stopped: boolean }> => ipcRenderer.invoke("runtime:stop"),
  checkRuntimeStatus: (): Promise<RuntimeStatusResult> => ipcRenderer.invoke("runtime:status"),
  onMenuAction: (action: MenuAction, callback: () => void): (() => void) => {
    const channel = `menu:${action}`;
    const listener = () => callback();
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  }
};

contextBridge.exposeInMainWorld("kindredAPI", api);

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
  },
  windowMinimize: (): void => { ipcRenderer.send("window:minimize"); },
  windowMaximize: (): void => { ipcRenderer.send("window:maximize"); },
  windowClose: (): void => { ipcRenderer.send("window:close"); },
  windowIsMaximized: (): Promise<boolean> => ipcRenderer.invoke("window:isMaximized"),
  onMaximizeChange: (callback: (isMaximized: boolean) => void): (() => void) => {
    const listener = (_event: unknown, isMaximized: boolean) => callback(isMaximized);
    ipcRenderer.on("window:maximizeChanged", listener);
    return () => {
      ipcRenderer.removeListener("window:maximizeChanged", listener);
    };
  },
  onFocusChange: (callback: (isFocused: boolean) => void): (() => void) => {
    const listener = (_event: unknown, isFocused: boolean) => callback(isFocused);
    ipcRenderer.on("window:focusChanged", listener);
    return () => {
      ipcRenderer.removeListener("window:focusChanged", listener);
    };
  },
  writeStdin: (data: string): void => { ipcRenderer.send("runtime:writeStdin", data); },
  onStdout: (callback: (data: string) => void): (() => void) => {
    const listener = (_event: unknown, data: string) => callback(data);
    ipcRenderer.on("runtime:stdout", listener);
    return () => { ipcRenderer.removeListener("runtime:stdout", listener); };
  },
  onStderr: (callback: (data: string) => void): (() => void) => {
    const listener = (_event: unknown, data: string) => callback(data);
    ipcRenderer.on("runtime:stderr", listener);
    return () => { ipcRenderer.removeListener("runtime:stderr", listener); };
  }
};

contextBridge.exposeInMainWorld("kindredAPI", api);

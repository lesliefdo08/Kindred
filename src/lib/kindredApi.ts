import type { DetectionResult, KindredApi, MenuAction, OpenFileResult, OpenFolderResult, RunCodeRequest, RunCodeResult, RuntimeStatusResult, SaveFileRequest, SaveFileResult } from "../types";

function unavailableError(operation: string): Error {
  return new Error(`Kindred bridge is unavailable. Cannot ${operation} outside the Electron shell.`);
}

const fallbackApi: KindredApi = {
  openFile: async (): Promise<OpenFileResult | null> => {
    throw unavailableError("open files");
  },
  openFolder: async (): Promise<OpenFolderResult | null> => {
    throw unavailableError("open folders");
  },
  readWorkspaceFile: async (_filePath: string): Promise<OpenFileResult | null> => {
    throw unavailableError("read workspace files");
  },
  saveFile: async (_request: SaveFileRequest): Promise<SaveFileResult | null> => {
    throw unavailableError("save files");
  },
  detectLanguage: async (_filePath: string | null, _code: string): Promise<DetectionResult> => {
    throw unavailableError("detect language");
  },
  runCode: async (_request: RunCodeRequest): Promise<RunCodeResult> => {
    throw unavailableError("run code");
  },
  stopRun: async (): Promise<{ stopped: boolean }> => {
    throw unavailableError("stop code execution");
  },
  checkRuntimeStatus: async (): Promise<RuntimeStatusResult> => {
    throw unavailableError("check runtime status");
  },
  onMenuAction: (_action: MenuAction, _callback: () => void): (() => void) => {
    throw unavailableError("listen to menu actions");
  },
  windowMinimize: (): void => {},
  windowMaximize: (): void => {},
  windowClose: (): void => {},
  windowIsMaximized: async (): Promise<boolean> => false,
  onMaximizeChange: (_callback: (isMaximized: boolean) => void): (() => void) => {
    return () => {};
  },
  onFocusChange: (_callback: (isFocused: boolean) => void): (() => void) => {
    return () => {};
  },
  writeStdin: (_data: string): void => {},
  onStdout: (_callback: (data: string) => void): (() => void) => { return () => {}; },
  onStderr: (_callback: (data: string) => void): (() => void) => { return () => {}; }
};

export function getKindredApi(): KindredApi {
  return window.kindredAPI ?? fallbackApi;
}

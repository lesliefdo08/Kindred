import type { DetectionResult, KindredApi, OpenFileResult, RunCodeRequest, RunCodeResult, SaveFileRequest, SaveFileResult } from "../types";

function unavailableError(operation: string): Error {
  return new Error(`Kindred bridge is unavailable. Cannot ${operation} outside the Electron shell.`);
}

const fallbackApi: KindredApi = {
  openFile: async (): Promise<OpenFileResult | null> => {
    throw unavailableError("open files");
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
  }
};

export function getKindredApi(): KindredApi {
  return window.kindredAPI ?? fallbackApi;
}

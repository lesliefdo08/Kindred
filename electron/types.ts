export type SupportedLanguage = "python" | "c" | "cpp" | "javascript" | "java" | "plaintext";

export interface LanguageCandidate {
  language: SupportedLanguage;
  score: number;
}

export interface DetectionResult {
  language: SupportedLanguage;
  reason: "extension" | "content" | "hybrid" | "ambiguous" | "fallback";
  isAmbiguous: boolean;
  confidence: number;
  candidates: LanguageCandidate[];
  message?: string;
}

export interface OpenFileResult {
  filePath: string;
  fileName: string;
  content: string;
  language: SupportedLanguage;
}

export interface SaveFileRequest {
  filePath: string | null;
  content: string;
  suggestedExtension?: string;
}

export interface SaveFileResult {
  filePath: string;
  fileName: string;
}

export interface ExplorerNode {
  name: string;
  path: string;
  type: "file" | "directory";
  children?: ExplorerNode[];
}

export interface OpenFolderResult {
  rootPath: string;
  rootName: string;
  entries: ExplorerNode[];
}

export interface RunCodeRequest {
  language: SupportedLanguage;
  code: string;
  filePath?: string | null;
  stdin?: string;
  executionMode?: "auto" | SupportedLanguage;
  detectionConfidence?: number;
  detectedLanguage?: SupportedLanguage;
  isAmbiguous?: boolean;
}

export interface RuntimeValidationResult {
  ok: boolean;
  missingCommands: string[];
}

export interface ExecutionLogEntry {
  at: string;
  step: string;
  detail: string;
}

export type ErrorCategory = "syntax" | "missing-module" | "compilation" | "runtime" | "unknown";

export interface ErrorInsight {
  category: ErrorCategory;
  title: string;
  explanation: string;
  suggestions: string[];
  probableCause?: string;
  suggestedFix?: string;
  patchPreview?: string;
}

export interface RunCodeResult {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  validation: RuntimeValidationResult;
  logs: ExecutionLogEntry[];
  errorInsights: ErrorInsight[];
}

export interface RuntimeStatusEntry {
  label: string;
  ready: boolean;
  detail: string;
}

export interface RuntimeStatusResult {
  entries: RuntimeStatusEntry[];
}

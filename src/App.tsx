import React, { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConsolePane from "./components/ConsolePane";
import EditorPane from "./components/EditorPane";
import Toolbar from "./components/Toolbar";
import { getKindredApi } from "./lib/kindredApi";
import {
  ConsoleTab,
  DetectionResult,
  EditorDiagnostic,
  ExplorerNode,
  ErrorInsight,
  ExecutionLogEntry,
  ExecutionSummary,
  OpenFileResult,
  OpenFolderResult,
  RunCodeResult,
  SupportedLanguage,
  WorkspaceDocument
} from "./types";

const detectionConfidenceThreshold = 0.62;

const starterTemplates: Record<SupportedLanguage, string> = {
  python: "print(\"Hello, world!\")\n",
  c: "#include <stdio.h>\n\nint main(void) {\n    printf(\"Hello, world!\\n\");\n    return 0;\n}\n",
  cpp: "#include <iostream>\n\nint main() {\n    std::cout << \"Hello, world!\\n\";\n    return 0;\n}\n",
  javascript: "console.log(\"Hello, world!\");\n",
  java: "public class Main {\n    public static void main(String[] args) {\n        System.out.println(\"Hello, world!\");\n    }\n}\n",
  plaintext: ""
};

const extensionByLanguage: Record<SupportedLanguage, string> = {
  python: "py",
  c: "c",
  cpp: "cpp",
  javascript: "js",
  java: "java",
  plaintext: "txt"
};

function languageLabel(language: SupportedLanguage): string {
  switch (language) {
    case "cpp":
      return "C++";
    case "javascript":
      return "JavaScript";
    case "java":
      return "Java";
    case "c":
      return "C";
    case "python":
      return "Python";
    default:
      return "Plaintext";
  }
}

function parseExecutionDiagnostics(stderr: string): EditorDiagnostic[] {
  if (!stderr.trim()) {
    return [];
  }

  const diagnostics: EditorDiagnostic[] = [];
  const cLikePattern = /^([^\n:]+):(\d+):(\d+):\s*(error|warning):\s*([^\n]+)/gm;
  const javaPattern = /(?:^|\n)(?:[\w.-]+\.java):(\d+):\s*(error|warning):\s*([^\n]+)/g;
  const pythonPattern = /File\s+"[^"]+",\s+line\s+(\d+)(?:,\s+in\s+([^\n]+))?/g;
  const pythonTail = stderr.trim().split(/\r?\n/).filter(Boolean).slice(-1)[0] ?? "Python runtime traceback";

  let match: RegExpExecArray | null;
  while ((match = cLikePattern.exec(stderr)) !== null) {
    diagnostics.push({
      line: Number(match[2]),
      column: Number(match[3]),
      severity: match[4].toLowerCase() === "warning" ? "warning" : "error",
      message: match[5]
    });
  }

  while ((match = javaPattern.exec(stderr)) !== null) {
    diagnostics.push({
      line: Number(match[1]),
      severity: match[2].toLowerCase() === "warning" ? "warning" : "error",
      message: match[3]
    });
  }

  while ((match = pythonPattern.exec(stderr)) !== null) {
    diagnostics.push({
      line: Number(match[1]),
      severity: "error",
      message: pythonTail
    });
  }

  return diagnostics.filter((diag) => Number.isFinite(diag.line) && diag.line > 0);
}

function summaryFromResult(result: RunCodeResult): ExecutionSummary {
  if (result.exitCode === 124) {
    return {
      title: "Timed out",
      detail: "Execution exceeded the time limit.",
      tone: "warning"
    };
  }

  if (/(EOFError|NoSuchElementException|end of file|missing input|scanf)/i.test(result.stderr)) {
    return {
      title: "Missing input",
      detail: "Program expected input.",
      tone: "warning"
    };
  }

  if (result.ok) {
    const seconds = (result.durationMs / 1000).toFixed(result.durationMs >= 1000 ? 1 : 2).replace(/\.0$/, "");
    return {
      title: "Completed",
      detail: `Completed in ${seconds}s`,
      tone: "success"
    };
  }

  if (/(error:|compilation terminated|undefined reference|cannot find symbol|expected .+ before|fatal error)/i.test(result.stderr)) {
    return {
      title: "Compilation failed",
      detail: result.stderr.split("\n")[0] || "The compiler reported an error.",
      tone: "error"
    };
  }

  return {
    title: "Execution failed",
    detail: result.stderr.split("\n")[0] || "Runtime returned an error.",
    tone: "error"
  };
}

function inferJavaClassName(source: string): string | null {
  const match = source.match(/^\s*public\s+class\s+([A-Za-z_][A-Za-z0-9_]*)/m);
  return match?.[1] ?? null;
}

function replaceFileNameInPath(inputPath: string, nextName: string): string {
  const slash = Math.max(inputPath.lastIndexOf("/"), inputPath.lastIndexOf("\\"));
  if (slash < 0) {
    return nextName;
  }
  return `${inputPath.slice(0, slash + 1)}${nextName}`;
}

function createDocument(params: Partial<WorkspaceDocument> & Pick<WorkspaceDocument, "id" | "fileName" | "content" | "executionMode" | "detection" | "diagnostics" | "dirty">): WorkspaceDocument {
  return {
    id: params.id,
    filePath: params.filePath ?? null,
    fileName: params.fileName,
    content: params.content,
    executionMode: params.executionMode,
    detection: params.detection,
    diagnostics: params.diagnostics,
    dirty: params.dirty
  };
}

function newDocumentId(): string {
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function inferDocumentLanguage(detection: DetectionResult | null, executionMode: "auto" | SupportedLanguage): SupportedLanguage {
  if (executionMode !== "auto") {
    return executionMode;
  }

  if (!detection || detection.isAmbiguous || detection.confidence < detectionConfidenceThreshold) {
    return "plaintext";
  }

  return detection.language;
}

function untitledFileName(index: number, extension: string): string {
  return index === 1 ? `untitled.${extension}` : `untitled${index}.${extension}`;
}

function parseUntitledIndex(fileName: string): number | null {
  const match = fileName.match(/^untitled(\d*)\.[^.]+$/i);
  if (!match) {
    return null;
  }

  return match[1] ? Number(match[1]) : 1;
}

function ensureUniqueFileName(fileName: string, documents: WorkspaceDocument[], excludingId?: string): string {
  const isTaken = (candidate: string): boolean => {
    const normalized = candidate.toLowerCase();
    return documents.some((document) => document.id !== excludingId && document.fileName.toLowerCase() === normalized);
  };

  if (!isTaken(fileName)) {
    return fileName;
  }

  const untitledMatch = fileName.match(/^untitled(\d*)\.(.+)$/i);
  if (untitledMatch) {
    const extension = untitledMatch[2];
    let index = 1;
    while (isTaken(untitledFileName(index, extension))) {
      index += 1;
    }
    return untitledFileName(index, extension);
  }

  const dot = fileName.lastIndexOf(".");
  const base = dot >= 0 ? fileName.slice(0, dot) : fileName;
  const extensionPart = dot >= 0 ? fileName.slice(dot) : "";
  let suffix = 2;
  while (isTaken(`${base}${suffix}${extensionPart}`)) {
    suffix += 1;
  }
  return `${base}${suffix}${extensionPart}`;
}

function nextUntitledFileName(extension: string, documents: WorkspaceDocument[], excludingId?: string): string {
  let index = 1;
  while (documents.some((document) => document.id !== excludingId && document.fileName.toLowerCase() === untitledFileName(index, extension).toLowerCase())) {
    index += 1;
  }
  return untitledFileName(index, extension);
}

export default function App() {
  const api = getKindredApi();
  const workspaceShellRef = useRef<HTMLElement | null>(null);
  const editorColumnRef = useRef<HTMLElement | null>(null);
  const isDraggingConsoleRef = useRef(false);
  const isDraggingExplorerRef = useRef(false);

  const [documents, setDocuments] = useState<WorkspaceDocument[]>([
    createDocument({
      id: newDocumentId(),
      filePath: null,
      fileName: "untitled.py",
      content: "",
      executionMode: "auto",
      detection: null,
      diagnostics: [],
      dirty: false
    })
  ]);
  const [activeDocumentId, setActiveDocumentId] = useState<string>(documents[0].id);
  const [executionSummary, setExecutionSummary] = useState<ExecutionSummary>({
    title: "Idle",
    detail: "Ready to run.",
    tone: "info"
  });
  const [isRunning, setIsRunning] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [command, setCommand] = useState("");
  const [durationMs, setDurationMs] = useState(0);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [logs, setLogs] = useState<ExecutionLogEntry[]>([]);
  const [errorInsights, setErrorInsights] = useState<ErrorInsight[]>([]);
  const [appError, setAppError] = useState("");
  const [stdin, setStdin] = useState("");
  const [consoleTab, setConsoleTab] = useState<ConsoleTab>("output");
  const [editorFontSize, setEditorFontSize] = useState<number>(14);
  const [consoleHeight, setConsoleHeight] = useState<number>(() => {
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 900;
    return Math.max(180, Math.round(viewportHeight * 0.25));
  });
  const [isResizingConsole, setIsResizingConsole] = useState(false);

  const [workspaceRootName, setWorkspaceRootName] = useState<string | null>(null);
  const [workspaceTree, setWorkspaceTree] = useState<ExplorerNode[]>([]);
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [explorerVisible, setExplorerVisible] = useState(false);
  const [explorerWidth, setExplorerWidth] = useState(260);
  const [isResizingExplorer, setIsResizingExplorer] = useState(false);
  const [focusLine, setFocusLine] = useState<number | null>(null);

  const activeDocument = useMemo(() => documents.find((document) => document.id === activeDocumentId) ?? documents[0], [documents, activeDocumentId]);
  const activeDetection = activeDocument?.detection ?? null;
  const effectiveLanguage = useMemo(
    () => inferDocumentLanguage(activeDetection, activeDocument?.executionMode ?? "auto"),
    [activeDetection, activeDocument?.executionMode]
  );
  const canRun = useMemo(() => activeDocument?.content.trim().length > 0 && effectiveLanguage !== "plaintext", [activeDocument, effectiveLanguage]);
  const hasWorkspace = workspaceRootName !== null;
  const showExplorerPanel = hasWorkspace && explorerVisible;
  const editorColumnStyle = useMemo(() => ({ "--console-height": `${consoleHeight}px` } as CSSProperties), [consoleHeight]);

  const autoDetectedLabel = useMemo(() => {
    if (!activeDocument || activeDocument.executionMode !== "auto") {
      return null;
    }

    if (!activeDetection || activeDetection.isAmbiguous || activeDetection.confidence < detectionConfidenceThreshold) {
      return "Language: Auto (keep typing for clearer detection)";
    }

    return `Language: ${languageLabel(activeDetection.language)} (auto-detected)`;
  }, [activeDocument, activeDetection]);

  const isStarterVisible = Boolean(activeDocument && !activeDocument.filePath && !activeDocument.content.trim());
  const activeLanguageForTemplate = activeDocument ? inferDocumentLanguage(activeDocument.detection, activeDocument.executionMode) : "python";

  const setActiveDocumentFromFile = useCallback(async (fileResult: OpenFileResult) => {
    const existing = documents.find((document) => document.filePath && fileResult.filePath && document.filePath.toLowerCase() === fileResult.filePath.toLowerCase());
    if (existing) {
      setActiveDocumentId(existing.id);
      return;
    }

    const nextDetection = await api.detectLanguage(fileResult.filePath, fileResult.content);
    const id = newDocumentId();
    setDocuments((current) => [
      ...current,
      createDocument({
        id,
        filePath: fileResult.filePath,
        fileName: fileResult.fileName,
        content: fileResult.content,
        executionMode: "auto",
        detection: nextDetection,
        diagnostics: [],
        dirty: false
      })
    ]);
    setActiveDocumentId(id);
  }, [api, documents]);

  useEffect(() => {
    if (!window.kindredAPI) {
      setAppError("Electron bridge is unavailable. Launch Kindred through npm run dev or the packaged desktop app.");
    }
  }, []);

  const updateActiveDocument = useCallback((updater: (current: WorkspaceDocument) => WorkspaceDocument) => {
    setDocuments((current) => current.map((document) => (document.id === activeDocumentId ? updater(document) : document)));
  }, [activeDocumentId]);

  const createNewDocument = useCallback((): void => {
    const id = newDocumentId();
    setDocuments((current) => {
      const fileName = nextUntitledFileName("py", current);
      return [
        ...current,
        createDocument({
          id,
          filePath: null,
          fileName,
          content: "",
          executionMode: "auto",
          detection: null,
          diagnostics: [],
          dirty: false
        })
      ];
    });
    setActiveDocumentId(id);
    setExecutionSummary({ title: "Idle", detail: "Ready to run.", tone: "info" });
    setConsoleTab("output");
  }, []);

  const handleOpen = useCallback(async (): Promise<void> => {
    try {
      const result = await api.openFile();
      if (!result) {
        return;
      }

      await setActiveDocumentFromFile(result);
      setExecutionSummary({ title: "Idle", detail: "Ready to run.", tone: "info" });
      setOutput("");
      setError("");
      setCommand("");
      setDurationMs(0);
      setExitCode(null);
      setLogs([]);
      setErrorInsights([]);
      setAppError("");
    } catch {
      setAppError("Unable to open the selected file.");
    }
  }, [api, setActiveDocumentFromFile]);

  const handleOpenFolder = useCallback(async (): Promise<void> => {
    try {
      const folder: OpenFolderResult | null = await api.openFolder();
      if (!folder) {
        return;
      }

      setWorkspaceRootName(folder.rootName);
      setWorkspaceTree(folder.entries);
      setCollapsedFolders({});
      setExplorerVisible(true);
      setAppError("");
    } catch {
      setAppError("Unable to open folder.");
    }
  }, [api]);

  const handleSave = useCallback(async (): Promise<void> => {
    try {
      const current = activeDocument;
      if (!current) {
        return;
      }

      let nextPath = current.filePath;
      let nextName = current.fileName;

      if (effectiveLanguage === "java") {
        const className = inferJavaClassName(current.content);
        if (className) {
          const expectedName = `${className}.java`;
          if (nextName !== expectedName) {
            const shouldRename = window.confirm(`Rename file to ${expectedName}?`);
            if (shouldRename) {
              nextName = expectedName;
              nextPath = nextPath ? replaceFileNameInPath(nextPath, expectedName) : null;
            }
          }
        }
      }

      const saved = await api.saveFile({
        filePath: nextPath,
        content: current.content,
        suggestedExtension: extensionByLanguage[effectiveLanguage]
      });

      if (!saved) {
        return;
      }

      setDocuments((currentDocuments) => currentDocuments.map((document) => (
        document.id === activeDocumentId
          ? { ...document, filePath: saved.filePath, fileName: saved.fileName, dirty: false }
          : document
      )));
      setAppError("");
    } catch {
      setAppError("Unable to save the current file.");
    }
  }, [api, activeDocument, activeDocumentId, effectiveLanguage]);

  const handleStop = useCallback(async (): Promise<void> => {
    if (!isRunning) {
      return;
    }

    await api.stopRun();
    setIsRunning(false);
    setExecutionSummary({ title: "Stopped", detail: "Execution was stopped by the user.", tone: "warning" });
  }, [api, isRunning]);

  const handleRun = useCallback(async (): Promise<void> => {
    if (!canRun || !activeDocument) {
      setError("Type code before running it.");
      return;
    }

    if (effectiveLanguage === "java") {
      const className = inferJavaClassName(activeDocument.content);
      if (className) {
        const expectedName = `${className}.java`;
        if (activeDocument.fileName !== expectedName) {
          const shouldRename = window.confirm(`Rename file to ${expectedName}?`);
          if (shouldRename) {
            setDocuments((current) => current.map((document) => (
              document.id === activeDocument.id
                ? {
                    ...document,
                    fileName: expectedName,
                    filePath: document.filePath ? replaceFileNameInPath(document.filePath, expectedName) : document.filePath,
                    dirty: true
                  }
                : document
            )));
          }
        }
      }
    }

    setIsRunning(true);
    setOutput("");
    setError("");
    setLogs([]);
    setErrorInsights([]);
    setDurationMs(0);
    setExitCode(null);
    setConsoleTab("output");
    setExecutionSummary({ title: "Running", detail: "Executing with current language mode.", tone: "info" });

    try {
      const result: RunCodeResult = await api.runCode({
        language: effectiveLanguage,
        code: activeDocument.content,
        filePath: activeDocument.filePath,
        stdin,
        executionMode: activeDocument.executionMode,
        detectionConfidence: activeDetection?.confidence ?? 0,
        detectedLanguage: activeDetection?.language ?? effectiveLanguage,
        isAmbiguous: activeDetection?.isAmbiguous ?? false
      });

      const diagnostics = parseExecutionDiagnostics(result.stderr);
      setDocuments((currentDocuments) => currentDocuments.map((document) => (
        document.id === activeDocumentId
          ? { ...document, diagnostics }
          : document
      )));

      setOutput(result.stdout);
      setError(result.stderr);
      setCommand(result.command);
      setDurationMs(result.durationMs);
      setExitCode(result.exitCode);
      setLogs(result.logs);
      setErrorInsights(result.errorInsights);
      setExecutionSummary(summaryFromResult(result));
      setAppError("");
    } catch (runError) {
      setExecutionSummary({ title: "Execution failed", detail: "Runner did not return a result.", tone: "error" });
      setExitCode(1);
      setAppError(runError instanceof Error ? runError.message : "Execution failed.");
    } finally {
      setIsRunning(false);
    }
  }, [api, activeDocument, activeDocumentId, activeDetection, canRun, effectiveLanguage, stdin]);

  const handleDocumentChange = useCallback((content: string) => {
    updateActiveDocument((current) => ({ ...current, content, dirty: true }));
  }, [updateActiveDocument]);

  const handleExecutionModeChange = useCallback((mode: "auto" | SupportedLanguage) => {
    updateActiveDocument((current) => ({ ...current, executionMode: mode }));
  }, [updateActiveDocument]);

  const loadStarterTemplate = useCallback((language: SupportedLanguage) => {
    updateActiveDocument((current) => ({
      ...current,
      content: starterTemplates[language],
      executionMode: language === "plaintext" ? "auto" : language,
      dirty: true
    }));
    setConsoleTab("output");
  }, [updateActiveDocument]);

  const openFromExplorer = useCallback(async (filePath: string) => {
    try {
      const result = await api.readWorkspaceFile(filePath);
      if (!result) {
        return;
      }
      await setActiveDocumentFromFile(result);
    } catch {
      setAppError("Unable to open workspace file.");
    }
  }, [api, setActiveDocumentFromFile]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
      const ctrlKey = isMac ? event.metaKey : event.ctrlKey;
      const key = event.key.toLowerCase();

      if (ctrlKey && key === "o" && !event.shiftKey) {
        event.preventDefault();
        void handleOpenFolder();
      } else if (ctrlKey && key === "o" && event.shiftKey) {
        event.preventDefault();
        void handleOpen();
      } else if (ctrlKey && key === "s") {
        event.preventDefault();
        void handleSave();
      } else if ((ctrlKey && key === "r") || event.key === "F5") {
        event.preventDefault();
        if (!isRunning && canRun) {
          void handleRun();
        }
      } else if (ctrlKey && key === "enter") {
        event.preventDefault();
        if (!isRunning && canRun) {
          void handleRun();
        }
      } else if (ctrlKey && key === "b") {
        event.preventDefault();
        if (hasWorkspace) {
          setExplorerVisible((current) => !current);
        }
      } else if (ctrlKey && event.key === "`") {
        event.preventDefault();
        setConsoleTab((current) => (current === "terminal" ? "output" : "terminal"));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canRun, handleOpen, handleOpenFolder, handleRun, handleSave, hasWorkspace, isRunning]);

  useEffect(() => {
    const unsubscribers: Array<() => void> = [];
    try {
      unsubscribers.push(api.onMenuAction("open", () => { void handleOpen(); }));
      unsubscribers.push(api.onMenuAction("openFolder", () => { void handleOpenFolder(); }));
      unsubscribers.push(api.onMenuAction("save", () => { void handleSave(); }));
      unsubscribers.push(api.onMenuAction("run", () => { void handleRun(); }));
    } catch {
      // No-op outside Electron shell.
    }

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [api, handleOpen, handleOpenFolder, handleRun, handleSave]);

  useEffect(() => {
    if (!activeDocument) {
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        const nextDetection = await api.detectLanguage(activeDocument.filePath, activeDocument.content);
        setDocuments((current) => current.map((document) => (
          document.id === activeDocument.id
            ? { ...document, detection: nextDetection }
            : document
        )));
      } catch (detectionError) {
        setAppError(detectionError instanceof Error ? detectionError.message : "Language detection failed.");
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [api, activeDocument?.content, activeDocument?.filePath, activeDocument?.id]);

  useEffect(() => {
    if (!activeDocument || activeDocument.filePath) {
      return;
    }

    const nextLanguage = inferDocumentLanguage(activeDocument.detection, activeDocument.executionMode);
    let nextFileName: string;

    if (nextLanguage === "java" && /\bpublic\s+static\s+void\s+main\s*\(/.test(activeDocument.content)) {
      nextFileName = "Main.java";
    } else {
      const untitledIndex = parseUntitledIndex(activeDocument.fileName) ?? 1;
      nextFileName = untitledFileName(untitledIndex, extensionByLanguage[nextLanguage]);
    }

    if (nextFileName === activeDocument.fileName) {
      return;
    }

    setDocuments((current) => {
      const uniqueName = ensureUniqueFileName(nextFileName, current, activeDocument.id);
      return current.map((document) => (
        document.id === activeDocument.id
          ? { ...document, fileName: uniqueName }
          : document
      ));
    });
  }, [activeDocument, documents]);

  useEffect(() => {
    if (isRunning) {
      setConsoleHeight((current) => {
        const minHeight = Math.max(170, Math.round(window.innerHeight * 0.2));
        return Math.max(current, minHeight);
      });
    }
  }, [isRunning]);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent): void {
      if (isDraggingConsoleRef.current && editorColumnRef.current) {
        const bounds = editorColumnRef.current.getBoundingClientRect();
        const minHeight = 140;
        const maxHeight = Math.max(190, Math.floor(bounds.height * 0.55));
        const nextHeight = Math.min(maxHeight, Math.max(minHeight, bounds.bottom - event.clientY));
        setConsoleHeight(nextHeight);
      }

      if (isDraggingExplorerRef.current && workspaceShellRef.current) {
        const bounds = workspaceShellRef.current.getBoundingClientRect();
        const minWidth = 180;
        const maxWidth = Math.min(420, Math.floor(bounds.width * 0.45));
        const nextWidth = Math.min(maxWidth, Math.max(minWidth, event.clientX - bounds.left));
        setExplorerWidth(nextWidth);
      }
    }

    function handleMouseUp(): void {
      if (isDraggingConsoleRef.current) {
        isDraggingConsoleRef.current = false;
        setIsResizingConsole(false);
      }

      if (isDraggingExplorerRef.current) {
        isDraggingExplorerRef.current = false;
        setIsResizingExplorer(false);
      }
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    if (isResizingExplorer) {
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      return;
    }

    if (isResizingConsole) {
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
      return;
    }

    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizingConsole, isResizingExplorer]);

  function closeDocument(documentId: string): void {
    setDocuments((current) => {
      const index = current.findIndex((document) => document.id === documentId);
      const remaining = current.filter((document) => document.id !== documentId);

      if (remaining.length === 0) {
        const id = newDocumentId();
        setActiveDocumentId(id);
        return [
          createDocument({
            id,
            filePath: null,
            fileName: "untitled.py",
            content: "",
            executionMode: "auto",
            detection: null,
            diagnostics: [],
            dirty: false
          })
        ];
      }

      if (documentId === activeDocumentId) {
        const fallback = remaining[Math.max(0, index - 1)] ?? remaining[0];
        if (fallback) {
          setActiveDocumentId(fallback.id);
        }
      }

      return remaining;
    });
  }

  function switchDocument(documentId: string): void {
    setActiveDocumentId(documentId);
    setFocusLine(null);
  }

  function toggleFolder(folderPath: string): void {
    setCollapsedFolders((current) => ({ ...current, [folderPath]: !current[folderPath] }));
  }

  function renderExplorerNodes(nodes: ExplorerNode[]): JSX.Element {
    return (
      <ul className="explorer-tree">
        {nodes.map((node) => (
          <li key={node.path}>
            {node.type === "directory" ? (
              <button type="button" className="explorer-node folder" onClick={() => toggleFolder(node.path)}>
                <span className="explorer-caret">{collapsedFolders[node.path] ? "▸" : "▾"}</span>
                <span>{node.name}</span>
              </button>
            ) : (
              <button type="button" className="explorer-node file" onClick={() => { void openFromExplorer(node.path); }} title={node.path}>
                <span className="explorer-caret">•</span>
                <span>{node.name}</span>
              </button>
            )}
            {node.type === "directory" && !collapsedFolders[node.path] && node.children && node.children.length > 0 ? renderExplorerNodes(node.children) : null}
          </li>
        ))}
      </ul>
    );
  }

  function beginConsoleResize(event: React.MouseEvent<HTMLDivElement>): void {
    event.preventDefault();
    isDraggingConsoleRef.current = true;
    setIsResizingConsole(true);
  }

  function beginExplorerResize(event: React.MouseEvent<HTMLDivElement>): void {
    event.preventDefault();
    isDraggingExplorerRef.current = true;
    setIsResizingExplorer(true);
  }

  return (
    <main className="app-shell">
      <Toolbar
        fileName={activeDocument?.fileName ?? "untitled.py"}
        executionMode={activeDocument?.executionMode ?? "auto"}
        detectedLanguage={effectiveLanguage}
        autoDetectedLabel={autoDetectedLabel}
        isRunning={isRunning}
        fontSize={editorFontSize}
        onFontSizeChange={setEditorFontSize}
        onSave={handleSave}
        onRun={handleRun}
        onStop={handleStop}
        onExecutionModeChange={handleExecutionModeChange}
      />

      {appError ? (
        <div className="app-banner" role="status" aria-live="polite">
          <strong>App error:</strong> {appError}
        </div>
      ) : null}

      <section className="workspace-shell" ref={workspaceShellRef}>
        {showExplorerPanel ? (
          <>
            <aside className="explorer-panel" style={{ width: explorerWidth }}>
              <div className="explorer-header">
                <span>{workspaceRootName}</span>
                <button type="button" className="btn ghost" onClick={() => setExplorerVisible(false)}>Hide</button>
              </div>
              <div className="explorer-body">
                {workspaceTree.length > 0 ? renderExplorerNodes(workspaceTree) : <p className="explorer-empty">Folder is empty.</p>}
              </div>
            </aside>
            <div className="explorer-splitter" onMouseDown={beginExplorerResize} role="separator" aria-label="Resize explorer" aria-orientation="vertical" />
          </>
        ) : null}

        <section className="editor-column" ref={editorColumnRef} style={editorColumnStyle}>
          <div className="document-tabs" role="tablist" aria-label="Open files">
            {documents.map((document) => (
              <div
                key={document.id}
                className={`document-tab ${document.id === activeDocumentId ? "active" : ""}`}
                role="tab"
                aria-selected={document.id === activeDocumentId}
                tabIndex={0}
                onClick={() => switchDocument(document.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    switchDocument(document.id);
                  }
                }}
                title={document.filePath ?? "Unsaved document"}
              >
                <span className="document-tab-title">{document.fileName}</span>
                {document.dirty ? <span className="document-dirty">●</span> : null}
                <button
                  type="button"
                  className="document-close"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeDocument(document.id);
                  }}
                  aria-label={`Close ${document.fileName}`}
                >
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="document-new" onClick={createNewDocument} title="New file">+</button>
          </div>

          <div className="editor-stage">
            {isStarterVisible ? (
              <div className="editor-empty-state">
                <p className="editor-empty-title">Choose a language or start typing.</p>
                <p className="editor-empty-copy">You can drop in a file, switch the mode, or load a starter template.</p>
                <div className="editor-empty-actions">
                  <button type="button" className="btn" onClick={() => loadStarterTemplate("python")}>Python Hello World</button>
                  <button type="button" className="btn" onClick={() => loadStarterTemplate("c")}>C Hello World</button>
                  <button type="button" className="btn" onClick={() => loadStarterTemplate("java")}>Java Main</button>
                </div>
              </div>
            ) : null}
            {activeDocument ? (
              <EditorPane
                value={activeDocument.content}
                onChange={handleDocumentChange}
                language={effectiveLanguage}
                diagnostics={activeDocument.diagnostics}
                focusLine={focusLine}
                onFocusLineHandled={() => setFocusLine(null)}
                fontSize={editorFontSize}
                placeholder={"// Start typing your code here..."}
              />
            ) : null}
          </div>

          <div className="console-splitter" onMouseDown={beginConsoleResize} role="separator" aria-label="Resize output panel" aria-orientation="horizontal" />

          <ConsolePane
            output={output}
            error={error}
            command={command}
            durationMs={durationMs}
            exitCode={exitCode}
            logs={logs}
            errorInsights={errorInsights}
            summary={executionSummary}
            isRunning={isRunning}
            stdin={stdin}
            onStdinChange={setStdin}
            diagnostics={activeDocument?.diagnostics ?? []}
            onSelectDiagnostic={(line) => setFocusLine(line)}
            activeTab={consoleTab}
            onTabChange={setConsoleTab}
          />
        </section>
      </section>
    </main>
  );
}

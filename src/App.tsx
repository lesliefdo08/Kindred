import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ConsolePane from "./components/ConsolePane";
import DiagnosticsPanel from "./components/DiagnosticsPanel";
import EditorPane from "./components/EditorPane";
import StdinPanel from "./components/StdinPanel";
import Toolbar from "./components/Toolbar";
import { getKindredApi } from "./lib/kindredApi";
import {
  ConsoleTab,
  DetectionResult,
  EditorDiagnostic,
  ErrorInsight,
  ExecutionLogEntry,
  ExecutionSummary,
  RunCodeResult,
  SidebarSection,
  SupportedLanguage,
  UtilityDrawerTab,
  WorkspaceDocument
} from "./types";

const defaultCode = `# Welcome to Kindred\nprint("Hello from Kindred")\n`;
const detectionConfidenceThreshold = 0.6;

const extensionByLanguage: Record<SupportedLanguage, string> = {
  python: "py",
  c: "c",
  cpp: "cpp",
  javascript: "js",
  java: "java",
  plaintext: "txt"
};

const languageNames: Record<SupportedLanguage, string> = {
  python: "Python",
  c: "C",
  cpp: "C++",
  javascript: "JavaScript",
  java: "Java",
  plaintext: "Plaintext"
};

const sidebarItems: Array<{ id: SidebarSection; label: string; shortcut: string }> = [
  { id: "explorer", label: "Explorer", shortcut: "Ctrl+1" },
  { id: "search", label: "Search", shortcut: "Ctrl+2" },
  { id: "diagnostics", label: "Diagnostics", shortcut: "Ctrl+3" },
  { id: "settings", label: "Settings", shortcut: "Ctrl+4" },
  { id: "extensions", label: "Extensions", shortcut: "Future" }
];

const utilityTabs: Array<{ id: UtilityDrawerTab; label: string }> = [
  { id: "input", label: "Input" },
  { id: "tests", label: "Tests" },
  { id: "docs", label: "Docs" }
];

const consoleTabs: Array<{ id: ConsoleTab; label: string }> = [
  { id: "output", label: "Output" },
  { id: "problems", label: "Problems" },
  { id: "input", label: "Input" },
  { id: "logs", label: "Logs" }
];

function parseExecutionDiagnostics(stderr: string): EditorDiagnostic[] {
  if (!stderr.trim()) {
    return [];
  }

  const diagnostics: EditorDiagnostic[] = [];
  const cLikePattern = /^([^\n:]+):(\d+):(\d+):\s*(error|warning):\s*([^\n]+)/gm;
  const javaPattern = /(?:^|\n)(?:[\w.-]+\.java):(\d+):\s*(error|warning):\s*([^\n]+)/g;
  const pythonPattern = /File\s+"[^"]+",\s+line\s+(\d+)/g;

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
      message: "Python runtime traceback"
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
    return {
      title: "Completed",
      detail: `Ran in ${result.durationMs} ms`,
      tone: "success"
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

  if (!detection) {
    return "python";
  }

  if (detection.isAmbiguous || detection.confidence < detectionConfidenceThreshold) {
    return "python";
  }

  return detection.language;
}

function tabFileName(language: SupportedLanguage, content: string, existingIndex: number): string {
  const lower = content.toLowerCase();
  if (language === "java") {
    const match = content.match(/^\s*public\s+class\s+([A-Za-z_][A-Za-z0-9_]*)/m);
    if (match?.[1]) {
      return `${match[1]}.java`;
    }
    return existingIndex === 0 ? "Main.java" : `Main-${existingIndex + 1}.java`;
  }

  if (language === "c") {
    return existingIndex === 0 ? "main.c" : `main-${existingIndex + 1}.c`;
  }

  if (language === "plaintext") {
    return existingIndex === 0 ? "untitled.txt" : `untitled-${existingIndex + 1}.txt`;
  }

  if (lower.includes("def ") || lower.includes("print(")) {
    return existingIndex === 0 ? "main.py" : `main-${existingIndex + 1}.py`;
  }

  return existingIndex === 0 ? `untitled.${extensionByLanguage[language]}` : `untitled-${existingIndex + 1}.${extensionByLanguage[language]}`;
}

function brandingAsset(pathName: string): string {
  return new URL(`../${pathName}`, import.meta.url).href;
}

export default function App() {
  const api = getKindredApi();
  const openFileInputRef = useRef<HTMLInputElement | null>(null);
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([
    createDocument({
      id: newDocumentId(),
      filePath: null,
      fileName: "untitled.py",
      content: defaultCode,
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
  const [logs, setLogs] = useState<ExecutionLogEntry[]>([]);
  const [errorInsights, setErrorInsights] = useState<ErrorInsight[]>([]);
  const [appError, setAppError] = useState("");
  const [stdin, setStdin] = useState("");
  const [sidebarSection, setSidebarSection] = useState<SidebarSection>("explorer");
  const [utilityTab, setUtilityTab] = useState<UtilityDrawerTab>("input");
  const [consoleTab, setConsoleTab] = useState<ConsoleTab>("output");
  const [drawerCollapsed, setDrawerCollapsed] = useState(true);
  const [recentFiles, setRecentFiles] = useState<string[]>(["examples/hello.py", "examples/main.c", "examples/Main.java"]);

  const activeDocument = useMemo(() => documents.find((document) => document.id === activeDocumentId) ?? documents[0], [documents, activeDocumentId]);
  const activeDetection = activeDocument?.detection ?? null;
  const effectiveLanguage = useMemo(() => inferDocumentLanguage(activeDetection, activeDocument?.executionMode ?? "auto"), [activeDetection, activeDocument?.executionMode]);
  const isLowConfidence = useMemo(() => Boolean(activeDetection && (activeDetection.isAmbiguous || activeDetection.confidence < detectionConfidenceThreshold)), [activeDetection]);
  const canRun = useMemo(() => activeDocument?.content.trim().length > 0 && effectiveLanguage !== "plaintext", [activeDocument, effectiveLanguage]);
  const explorerDocuments = useMemo(() => documents, [documents]);

  useEffect(() => {
    if (!window.kindredAPI) {
      setAppError("Electron bridge is unavailable. Launch Kindred through npm run dev or the packaged desktop app.");
    }
  }, []);

  const updateActiveDocument = useCallback((updater: (current: WorkspaceDocument) => WorkspaceDocument) => {
    setDocuments((current) => current.map((document) => (document.id === activeDocumentId ? updater(document) : document)));
  }, [activeDocumentId]);

  const createNewDocument = useCallback((template?: { fileName: string; content: string; language?: SupportedLanguage; executionMode?: "auto" | SupportedLanguage }) => {
    const id = newDocumentId();
    const nextDocument = createDocument({
      id,
      filePath: null,
      fileName: template?.fileName ?? "untitled.py",
      content: template?.content ?? "",
      executionMode: template?.executionMode ?? "auto",
      detection: null,
      diagnostics: [],
      dirty: Boolean(template?.content)
    });

    setDocuments((current) => [...current, nextDocument]);
    setActiveDocumentId(id);
    setConsoleTab("output");
    setExecutionSummary({ title: "Idle", detail: "Ready to run.", tone: "info" });
    setSidebarSection("explorer");
    setDrawerCollapsed(false);
  }, []);

  const handleDetectCurrent = useCallback(async (filePath: string | null, content: string) => {
    const nextDetection = await api.detectLanguage(filePath, content);
    updateActiveDocument((current) => ({ ...current, detection: nextDetection }));
    return nextDetection;
  }, [api, updateActiveDocument]);

  const handleOpen = useCallback(async (): Promise<void> => {
    try {
      const result = await api.openFile();
      if (!result) {
        return;
      }

      const nextDetection = await api.detectLanguage(result.filePath, result.content);
      const id = newDocumentId();
      setDocuments((current) => [
        ...current,
        createDocument({
          id,
          filePath: result.filePath,
          fileName: result.fileName,
          content: result.content,
          executionMode: "auto",
          detection: nextDetection,
          diagnostics: [],
          dirty: false
        })
      ]);
      setActiveDocumentId(id);
      setExecutionSummary({ title: "Idle", detail: "Ready to run.", tone: "info" });
      setOutput("");
      setError("");
      setCommand("");
      setDurationMs(0);
      setLogs([]);
      setErrorInsights([]);
      setAppError("");
      setRecentFiles((current) => [result.fileName, ...current.filter((entry) => entry !== result.fileName)].slice(0, 8));
      setSidebarSection("explorer");
      setDrawerCollapsed(false);
    } catch {
      setAppError("Unable to open the selected file.");
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
      setRecentFiles((currentFiles) => [saved.fileName, ...currentFiles.filter((entry) => entry !== saved.fileName)].slice(0, 8));
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

    setIsRunning(true);
    setOutput("");
    setError("");
    setLogs([]);
    setErrorInsights([]);
    setConsoleTab("output");
    setExecutionSummary({ title: "Running...", detail: "Executing with current language mode.", tone: "info" });

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
      setLogs(result.logs);
      setErrorInsights(result.errorInsights);
      setExecutionSummary(summaryFromResult(result));
      setAppError("");
    } catch (runError) {
      setExecutionSummary({ title: "Execution failed", detail: "Runner did not return a result.", tone: "error" });
      setAppError(runError instanceof Error ? runError.message : "Execution failed.");
    } finally {
      setIsRunning(false);
    }
  }, [api, activeDocument, activeDocumentId, activeDetection, canRun, effectiveLanguage, stdin]);

  const handleDocumentChange = useCallback((content: string) => {
    updateActiveDocument((current) => ({ ...current, content, dirty: true, diagnostics: current.dirty ? current.diagnostics : current.diagnostics }));
  }, [updateActiveDocument]);

  const handleExecutionModeChange = useCallback((mode: "auto" | SupportedLanguage) => {
    updateActiveDocument((current) => ({ ...current, executionMode: mode }));
  }, [updateActiveDocument]);

  const handleNewFile = useCallback((language: SupportedLanguage = "python") => {
    const fileName = language === "java" ? "Main.java" : language === "c" ? "main.c" : language === "python" ? "main.py" : `untitled.${extensionByLanguage[language]}`;
    createNewDocument({ fileName, content: language === "java" ? 'public static void main(String[] args) {\n  System.out.println("Hello from Java");\n}\n' : language === "c" ? '#include <stdio.h>\nint main(void) {\n  printf("Hello, World!\\n");\n  return 0;\n}\n' : defaultCode, executionMode: "auto" });
  }, [createNewDocument]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform);
      const ctrlKey = isMac ? event.metaKey : event.ctrlKey;

      if (ctrlKey && event.key === "o") {
        event.preventDefault();
        void handleOpen();
      } else if (ctrlKey && event.key === "s") {
        event.preventDefault();
        void handleSave();
      } else if ((ctrlKey && event.key === "r") || event.key === "F5") {
        event.preventDefault();
        if (!isRunning && canRun) {
          void handleRun();
        }
      } else if (ctrlKey && event.key === "1") {
        event.preventDefault();
        setSidebarSection("explorer");
      } else if (ctrlKey && event.key === "2") {
        event.preventDefault();
        setSidebarSection("search");
      } else if (ctrlKey && event.key === "3") {
        event.preventDefault();
        setSidebarSection("diagnostics");
      } else if (ctrlKey && event.key === "4") {
        event.preventDefault();
        setSidebarSection("settings");
      } else if (ctrlKey && event.key === "`") {
        event.preventDefault();
        setDrawerCollapsed((current) => !current);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRunning, canRun, handleOpen, handleSave, handleRun]);

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
      } catch (error) {
        setAppError(error instanceof Error ? error.message : "Language detection failed.");
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [api, activeDocument?.content, activeDocument?.filePath, activeDocument?.id]);

  useEffect(() => {
    if (activeDocument && !activeDocument.filePath) {
      const nextLanguage = inferDocumentLanguage(activeDocument.detection, activeDocument.executionMode);
      const extension = extensionByLanguage[nextLanguage];
      const nextFileName = nextLanguage === "java" && activeDocument.content.includes("public static void main")
        ? "Main.java"
        : `untitled.${extension}`;
      if (activeDocument.fileName !== nextFileName) {
        updateActiveDocument((current) => ({ ...current, fileName: nextFileName }));
      }
    }
  }, [activeDocument, updateActiveDocument]);

  useEffect(() => {
    if (!activeDocument) {
      return;
    }
    const nextLanguage = inferDocumentLanguage(activeDocument.detection, activeDocument.executionMode);
    setExecutionSummary((current) => (current.title === "Idle" ? current : current));
    if (activeDocument.executionMode === "auto") {
      // Keep toolbar and editor language in sync with the detected value.
      if (nextLanguage !== activeDocument.detection?.language && !activeDocument.detection?.isAmbiguous) {
        setDocuments((current) => current.map((document) => document.id === activeDocument.id ? { ...document, executionMode: "auto" } : document));
      }
    }
  }, [activeDocument]);

  const activeSidebarLabel = sidebarItems.find((item) => item.id === sidebarSection)?.label ?? "Explorer";
  const activeUtilityLabel = utilityTabs.find((item) => item.id === utilityTab)?.label ?? "Input";
  const activeConsoleLabel = consoleTabs.find((item) => item.id === consoleTab)?.label ?? "Output";
  const hasDocuments = documents.length > 0;

  function closeDocument(documentId: string): void {
    if (documents.length === 1) {
      createNewDocument();
      return;
    }

    setDocuments((current) => current.filter((document) => document.id !== documentId));
    if (documentId === activeDocumentId) {
      const remaining = documents.filter((document) => document.id !== documentId);
      setActiveDocumentId(remaining[0]?.id ?? activeDocumentId);
    }
  }

  function switchDocument(documentId: string): void {
    setActiveDocumentId(documentId);
    setDrawerCollapsed(true);
  }

  function addRecentFile(name: string): void {
    setRecentFiles((current) => [name, ...current.filter((entry) => entry !== name)].slice(0, 8));
  }

  function handleInsertExample(exampleCode: string): void {
    updateActiveDocument((current) => ({
      ...current,
      content: exampleCode,
      filePath: null,
      fileName: current.fileName,
      executionMode: "auto",
      detection: null,
      diagnostics: [],
      dirty: true
    }));
    setDrawerCollapsed(false);
    setSidebarSection("explorer");
  }

  const currentLanguage = effectiveLanguage;
  const currentDocumentIndex = documents.findIndex((document) => document.id === activeDocumentId);

  return (
    <main className="app-shell">
      <Toolbar
        fileName={activeDocument?.fileName ?? "untitled.py"}
        executionMode={activeDocument?.executionMode ?? "auto"}
        detectedLanguage={activeDetection?.language ?? currentLanguage}
        detectionConfidence={activeDetection?.confidence ?? 0}
        isAmbiguous={Boolean(activeDetection?.isAmbiguous)}
        isRunning={isRunning}
        onOpen={handleOpen}
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

      <section className="workspace-frame">
        <aside className="activity-bar" aria-label="Workspace sections">
          {sidebarItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`activity-button ${sidebarSection === item.id ? "active" : ""}`}
              onClick={() => setSidebarSection(item.id)}
              title={item.shortcut}
            >
              {item.label}
            </button>
          ))}
        </aside>

        <section className="editor-column">
          <div className="editor-strip">
            <div className="editor-title-row">
              <div className="editor-brand">
                <img className="header-brandmark" src={brandingAsset("kindredlogo.png")} alt="Kindred" />
                <div>
                  <div className="editor-kicker">Kindred</div>
                  <h2>{activeDocument?.fileName ?? "Untitled"}</h2>
                </div>
              </div>
              <div className="editor-status-group">
                <span className={`status-pill ${isRunning ? "running" : currentLanguage === "plaintext" ? "neutral" : "ready"}`}>{isRunning ? "Running..." : languageNames[currentLanguage]}</span>
                {activeDetection ? <span className="status-chip" title={`Confidence ${Math.round(activeDetection.confidence * 100)}%`}>{`${Math.round(activeDetection.confidence * 100)}% confidence`}</span> : null}
              </div>
            </div>

            <div className="document-tabs" role="tablist" aria-label="Open files">
              {documents.map((document, index) => (
                <button
                  key={document.id}
                  type="button"
                  className={`document-tab ${document.id === activeDocumentId ? "active" : ""}`}
                  onClick={() => switchDocument(document.id)}
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
                  {index === currentDocumentIndex ? <span className="document-active-indicator" /> : null}
                </button>
              ))}
              <button type="button" className="document-tab new-tab" onClick={() => createNewDocument()}>
                + New
              </button>
            </div>
          </div>

          <div className="editor-stage">
            {activeDocument ? (
              <EditorPane
                value={activeDocument.content}
                onChange={handleDocumentChange}
                language={currentLanguage}
                diagnostics={activeDocument.diagnostics}
              />
            ) : null}
          </div>

          <ConsolePane
            output={output}
            error={error}
            command={command}
            durationMs={durationMs}
            logs={logs}
            errorInsights={errorInsights}
            summary={executionSummary}
            isRunning={isRunning}
            stdin={stdin}
            activeTab={consoleTab}
            onTabChange={setConsoleTab}
          />
        </section>

        <aside className={`utility-drawer ${drawerCollapsed ? "collapsed" : "open"}`}>
          <div className="utility-drawer-header">
            <div>
              <div className="panel-kicker">Utility Drawer</div>
              <h2>{activeUtilityLabel}</h2>
            </div>
            <button type="button" className="btn ghost" onClick={() => setDrawerCollapsed((current) => !current)}>
              {drawerCollapsed ? "Open" : "Collapse"}
            </button>
          </div>

          <div className="utility-tabs">
            {utilityTabs.map((tab) => (
              <button key={tab.id} type="button" className={`utility-tab ${utilityTab === tab.id ? "active" : ""}`} onClick={() => setUtilityTab(tab.id)}>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="utility-drawer-body">
            {utilityTab === "input" ? <StdinPanel value={stdin} onChange={setStdin} /> : null}
            {utilityTab === "tests" ? (
              <section className="drawer-section">
                <div className="drawer-section-title">Tests</div>
                <p>Run the current document, inspect runtime output, and use the Problems tab for parsed diagnostics.</p>
                <button type="button" className="btn primary" onClick={handleRun} disabled={isRunning || !canRun}>Run current file</button>
              </section>
            ) : null}
            {utilityTab === "docs" ? (
              <section className="drawer-section">
                <div className="drawer-section-title">Docs</div>
                <p>Use the Explorer to switch files, the Console tabs to inspect problems, and the sidebar shortcuts to stay in control.</p>
              </section>
            ) : null}
          </div>
        </aside>
      </section>

      <footer className="workspace-footer">
        <div className="footer-brand">
          <img className="footer-brandmark" src={brandingAsset("kindred_logo_name.png")} alt="Kindred" />
        </div>
        <div className="footer-meta">
          <span>{activeSidebarLabel}</span>
          <span>{activeConsoleLabel}</span>
          <span>{drawerCollapsed ? "Drawer collapsed" : "Drawer open"}</span>
        </div>
      </footer>

      {!hasDocuments ? (
        <div className="welcome-surface">
          <div className="welcome-card">
            <img className="welcome-brand" src={brandingAsset("kindred_logo_name.png")} alt="Kindred" />
            <h2>Run code instantly. No setup.</h2>
            <p>Open multiple files, switch tabs, and stay in control with a professional local-first IDE workflow.</p>
            <div className="welcome-actions">
              <button type="button" className="btn primary" onClick={() => handleNewFile()}>New Python file</button>
              <button type="button" className="btn ghost" onClick={() => handleOpen()}>Open file</button>
            </div>
            <div className="welcome-list compact">
              {recentFiles.slice(0, 5).map((file) => <span key={file}>{file}</span>)}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

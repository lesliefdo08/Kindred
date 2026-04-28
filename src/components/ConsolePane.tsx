import { useCallback, useEffect, useMemo, useRef } from "react";
import { ConsoleTab, EditorDiagnostic, ErrorInsight, ExecutionLogEntry, ExecutionSummary } from "../types";

interface ConsolePaneProps {
  output: string;
  error: string;
  command: string;
  durationMs: number;
  exitCode: number | null;
  logs: ExecutionLogEntry[];
  errorInsights: ErrorInsight[];
  summary: ExecutionSummary;
  isRunning: boolean;
  terminalLines: string[];
  onTerminalInput: (line: string) => void;
  diagnostics: EditorDiagnostic[];
  onSelectDiagnostic: (line: number) => void;
  activeTab: ConsoleTab;
  onTabChange: (tab: ConsoleTab) => void;
}

function humanizeLogStep(step: string): string {
  switch (step) {
    case "compile":
      return "Compiler invoked";
    case "compile-success":
      return "Compilation completed";
    case "execute":
      return "Program started";
    case "execute-success":
      return "Program finished";
    case "execute-timeout":
      return "Execution timed out";
    case "runtime-attempt":
      return "Runtime check";
    case "auto-fallback":
      return "Fallback strategy";
    default:
      return step.replace(/-/g, " ");
  }
}

export default function ConsolePane({ output, error, command, durationMs, exitCode, logs, errorInsights, summary, isRunning, terminalLines, onTerminalInput, diagnostics, onSelectDiagnostic, activeTab, onTabChange }: ConsolePaneProps) {

  const readableLogs = useMemo(() => {
    return logs.map((log) => `[${log.at}] ${humanizeLogStep(log.step)}: ${log.detail}`).join("\n");
  }, [logs]);

  const statusIcon = summary.tone === "success" ? "✔" : summary.tone === "error" ? "✖" : isRunning ? "▶" : "●";
  const stateMessage = isRunning
    ? "Running…"
    : command
      ? `${summary.title} • ${summary.detail} • Exit code ${exitCode ?? (summary.tone === "success" ? "0" : "1")}`
      : "Idle";

  const terminalStreamRef = useRef<HTMLPreElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll terminal to bottom on new content
  useEffect(() => {
    if (terminalStreamRef.current) {
      terminalStreamRef.current.scrollTop = terminalStreamRef.current.scrollHeight;
    }
  }, [terminalLines, output, error]);

  // Focus input when switching to terminal tab while running
  useEffect(() => {
    if (activeTab === "terminal" && isRunning && inputRef.current) {
      inputRef.current.focus();
    }
  }, [activeTab, isRunning]);

  const handleInputKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const value = (event.target as HTMLInputElement).value;
      onTerminalInput(value);
      (event.target as HTMLInputElement).value = "";
    }
  }, [onTerminalInput]);

  const handleTerminalBodyClick = useCallback(() => {
    if (isRunning && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isRunning]);

  return (
    <section className="console-pane" aria-label="Execution output" tabIndex={-1}>
      <div className="console-header">
        <div className={`console-summary ${summary.tone}`}>
          <span className="summary-icon" aria-hidden="true">{statusIcon}</span>
          <span className="summary-title">{stateMessage}</span>
        </div>
      </div>
      <div className="console-tabs" role="tablist" aria-label="Console views">
        <button type="button" className={`console-tab ${activeTab === "output" ? "active" : ""}`} onClick={() => onTabChange("output")}>Output</button>
        <button type="button" className={`console-tab ${activeTab === "problems" ? "active" : ""}`} onClick={() => onTabChange("problems")}>Problems</button>
        <button type="button" className={`console-tab ${activeTab === "terminal" ? "active" : ""}`} onClick={() => onTabChange("terminal")}>Terminal</button>
        <button type="button" className={`console-tab ${activeTab === "logs" ? "active" : ""}`} onClick={() => onTabChange("logs")}>Logs</button>
      </div>
      <div className="console-body">
        {activeTab === "output" ? <pre className="console-output">{output || "No output yet\nClick Run to execute your program."}</pre> : null}
        {activeTab === "problems" ? (
          <div className="problem-list">
            {diagnostics.length > 0 ? (
              <section className="result-block">
                <h3 className="result-title warning">Diagnostics</h3>
                <ul className="diagnostic-list">
                  {diagnostics.map((diagnostic, index) => (
                    <li key={`${diagnostic.line}-${diagnostic.column ?? 0}-${index}`}>
                      <button type="button" className="diagnostic-item" onClick={() => onSelectDiagnostic(diagnostic.line)}>
                        Line {diagnostic.line}: {diagnostic.message}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            <section className="result-block success-block">
              <h3 className="result-title success">Output</h3>
              <pre className="console-output">{output || "No output yet\nClick Run to execute your program."}</pre>
            </section>
            <section className="result-block warning-block">
              <h3 className="result-title warning">Errors</h3>
              <pre className="console-output console-error">{error || "No errors"}</pre>
            </section>
            {errorInsights.length > 0 ? (
              <div className="error-insights">
                {errorInsights.map((insight) => (
                  <div key={`${insight.category}-${insight.title}`} className="error-insight">
                    <div className="error-insight-title">{insight.title}</div>
                    <div className="error-insight-body">{insight.explanation}</div>
                    {insight.probableCause ? <div className="error-insight-meta"><strong>Probable cause:</strong> {insight.probableCause}</div> : null}
                    {insight.suggestedFix ? <div className="error-insight-meta"><strong>Suggested fix:</strong> {insight.suggestedFix}</div> : null}
                    {insight.patchPreview ? <pre className="console-output console-log error-patch-preview">{insight.patchPreview}</pre> : null}
                    {insight.suggestions.length > 0 ? (
                      <ul className="error-insight-list">
                        {insight.suggestions.map((suggestion) => (
                          <li key={suggestion}>{suggestion}</li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {activeTab === "terminal" ? (
          <div className="terminal-view" onClick={handleTerminalBodyClick}>
            {terminalLines.length > 0 ? (
              <pre className="console-output terminal-stream" ref={terminalStreamRef}>
                {terminalLines.map((line, i) => (
                  <span key={i} className={line.startsWith("\x1b[stderr]") ? "terminal-stderr" : line.startsWith("> ") ? "terminal-stdin-echo" : ""}>{line.startsWith("\x1b[stderr]") ? line.slice(9) : line}{"\n"}</span>
                ))}
              </pre>
            ) : (
              <pre className="console-output terminal-idle" ref={terminalStreamRef}>Terminal ready.{"\n"}Run your program to see output here.</pre>
            )}
            {isRunning ? (
              <div className="terminal-input-line">
                <span className="terminal-input-prompt">{">"}</span>
                <input
                  ref={inputRef}
                  type="text"
                  className="terminal-inline-input"
                  onKeyDown={handleInputKeyDown}
                  placeholder="Type input and press Enter…"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            ) : null}
          </div>
        ) : null}
        {activeTab === "logs" ? (
          <details className="advanced-logs" open>
            <summary>Execution Logs</summary>
            <pre className="console-output console-log">{readableLogs || "No logs yet"}</pre>
          </details>
        ) : null}
      </div>
    </section>
  );
}

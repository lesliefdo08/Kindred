import { useMemo } from "react";
import { ConsoleTab, ErrorInsight, ExecutionLogEntry, ExecutionSummary } from "../types";

interface ConsolePaneProps {
  output: string;
  error: string;
  command: string;
  durationMs: number;
  logs: ExecutionLogEntry[];
  errorInsights: ErrorInsight[];
  summary: ExecutionSummary;
  isRunning: boolean;
  stdin: string;
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

export default function ConsolePane({ output, error, command, durationMs, logs, errorInsights, summary, isRunning, stdin, activeTab, onTabChange }: ConsolePaneProps) {

  const readableLogs = useMemo(() => {
    return logs.map((log) => `[${log.at}] ${humanizeLogStep(log.step)}: ${log.detail}`).join("\n");
  }, [logs]);

  return (
    <section className="console-pane" aria-label="Execution output" tabIndex={-1}>
      <div className="console-header">
        <div className={`console-summary ${summary.tone}`}>
          <span className="summary-title">{summary.title}</span>
          <span className="summary-detail">{summary.detail}</span>
        </div>
        <div className="console-meta-stack">
          <span className="console-meta">{isRunning ? "Running..." : command ? `Exit code: ${summary.tone === "success" ? 0 : "1"}` : "Idle"}</span>
          <span className="console-meta">{durationMs > 0 ? `Completed in ${durationMs} ms` : "Ready"}</span>
        </div>
      </div>
      <div className="console-tabs" role="tablist" aria-label="Console views">
        <button type="button" className={`console-tab ${activeTab === "output" ? "active" : ""}`} onClick={() => onTabChange("output")}>Output</button>
        <button type="button" className={`console-tab ${activeTab === "problems" ? "active" : ""}`} onClick={() => onTabChange("problems")}>Problems</button>
        <button type="button" className={`console-tab ${activeTab === "input" ? "active" : ""}`} onClick={() => onTabChange("input")}>Input</button>
        <button type="button" className={`console-tab ${activeTab === "logs" ? "active" : ""}`} onClick={() => onTabChange("logs")}>Logs</button>
      </div>
      <div className="console-body">
        {activeTab === "output" ? <pre className="console-output">{output || "No output"}</pre> : null}
        {activeTab === "problems" ? (
          <div className="problem-list">
            <section className="result-block success-block">
              <h3 className="result-title success">Output</h3>
              <pre className="console-output">{output || "No output"}</pre>
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
        {activeTab === "input" ? <pre className="console-output console-log">{stdin || "No program input"}</pre> : null}
        {activeTab === "logs" ? (
          <details className="advanced-logs" open>
            <summary>Advanced Logs</summary>
            <pre className="console-output console-log">{readableLogs || "No logs yet"}</pre>
          </details>
        ) : null}
      </div>
    </section>
  );
}

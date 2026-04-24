import { SupportedLanguage } from "../types";

interface ToolbarProps {
  fileName: string;
  executionMode: "auto" | SupportedLanguage;
  detectedLanguage: SupportedLanguage;
  autoDetectedLabel: string | null;
  isRunning: boolean;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  onSave: () => void;
  onRun: () => void;
  onStop: () => void;
  onExecutionModeChange: (mode: "auto" | SupportedLanguage) => void;
}

export default function Toolbar({
  fileName,
  executionMode,
  detectedLanguage,
  autoDetectedLabel,
  isRunning,
  fontSize,
  onFontSizeChange,
  onSave,
  onRun,
  onStop,
  onExecutionModeChange
}: ToolbarProps) {
  const effectiveLanguage = executionMode === "auto" ? detectedLanguage : executionMode;

  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <div className="brand-lockup" aria-label="Kindred">
          <img src="/kindredlogo.png" alt="" className="toolbar-logo" />
          <span className="brand-name">Kindred</span>
        </div>
        <span className="file-chip" title={fileName}>{fileName}</span>
        <div className="language-stack">
          <select
            className="language-select"
            value={executionMode}
            onChange={(event) => onExecutionModeChange(event.target.value as "auto" | SupportedLanguage)}
            aria-label="Language mode"
          >
            <option value="auto">Auto</option>
            <option value="python">Python</option>
            <option value="c">C</option>
            <option value="java">Java</option>
          </select>
          {autoDetectedLabel ? <span className="auto-detected-label">{autoDetectedLabel}</span> : null}
        </div>
        <select
          className="language-select font-size-select"
          value={fontSize}
          onChange={(event) => onFontSizeChange(Number(event.target.value))}
          aria-label="Editor font size"
          title="Editor font size"
        >
          <option value="13">Small</option>
          <option value="14">Default</option>
          <option value="16">Large</option>
        </select>
      </div>
      <div className="toolbar-right">
        <button type="button" className="btn primary run-button" onClick={onRun} disabled={isRunning || effectiveLanguage === "plaintext"} title="Ctrl+Enter or F5">
          {isRunning ? "Running..." : "Run"}
        </button>
        <button type="button" className="btn ghost" onClick={onSave} title="Ctrl+S">
          Save
        </button>
        {isRunning ? (
          <button type="button" className="btn danger-ghost stop-button" onClick={onStop} title="Stop execution">
            Stop
          </button>
        ) : null}
      </div>
    </header>
  );
}

import { SupportedLanguage } from "../types";

interface ToolbarProps {
  fileName: string;
  executionMode: "auto" | SupportedLanguage;
  detectedLanguage: SupportedLanguage;
  detectionConfidence: number;
  isAmbiguous: boolean;
  isRunning: boolean;
  onOpen: () => void;
  onSave: () => void;
  onRun: () => void;
  onStop: () => void;
  onExecutionModeChange: (mode: "auto" | SupportedLanguage) => void;
}

const languageLabels: Record<SupportedLanguage, string> = {
  python: "Python",
  c: "C",
  cpp: "C++",
  javascript: "JavaScript",
  java: "Java",
  plaintext: "Plaintext"
};

const executionModeLabels: Record<"auto" | SupportedLanguage, string> = {
  auto: "Auto",
  python: "Python",
  c: "C",
  cpp: "C++",
  javascript: "JavaScript",
  java: "Java",
  plaintext: "Plaintext"
};

export default function Toolbar({
  fileName,
  executionMode,
  detectedLanguage,
  detectionConfidence,
  isAmbiguous,
  isRunning,
  onOpen,
  onSave,
  onRun,
  onStop,
  onExecutionModeChange
}: ToolbarProps) {
  const confidenceLabel = `${Math.round(detectionConfidence * 100)}%`;

  return (
    <header className="toolbar">
      <div className="toolbar-left">
        <img className="brand-mark" src="/kindredlogo.png" alt="Kindred" />
        <div className="brand-copy">
          <h1>Kindred</h1>
          <span className="brand-tagline">Run code instantly. No setup.</span>
        </div>
        <span className="file-chip">{fileName}</span>
        <div className="language-control">
          <span className="language-chip subtle detected-chip" title={`Confidence ${confidenceLabel}`}>{languageLabels[detectedLanguage]}</span>
          <select
            className="language-select detection-select"
            value={executionMode}
            onChange={(event) => onExecutionModeChange(event.target.value as "auto" | SupportedLanguage)}
            aria-label="Language mode"
            title={`Detected confidence ${confidenceLabel}`}
          >
            <option value="auto">Auto</option>
            <option value="c">C</option>
            <option value="python">Python</option>
            <option value="java">Java</option>
          </select>
        </div>
      </div>
      <div className="toolbar-right">
        <button type="button" className="btn ghost" onClick={onOpen} title="Ctrl+O">
          Open
        </button>
        <button type="button" className="btn ghost" onClick={onSave} title="Ctrl+S">
          Save
        </button>
        <button type="button" className="btn danger-ghost stop-button" onClick={onStop} disabled={!isRunning} title="Stop execution">
          Stop
        </button>
        <button type="button" className="btn primary run-button" onClick={onRun} disabled={isRunning || executionMode === "plaintext"} title="Ctrl+R or F5">
          {isRunning ? "Running..." : "Run code"}
        </button>
      </div>
    </header>
  );
}

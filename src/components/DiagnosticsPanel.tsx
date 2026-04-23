import { DetectionResult, ErrorInsight } from "../types";

interface DiagnosticsPanelProps {
  detection: DetectionResult | null;
  warning: string;
  errorInsights: ErrorInsight[];
}

const languageNames: Record<string, string> = {
  python: "Python",
  c: "C",
  cpp: "C++",
  javascript: "JavaScript",
  java: "Java",
  plaintext: "Plaintext"
};

export default function DiagnosticsPanel({ detection, warning, errorInsights }: DiagnosticsPanelProps) {
  return (
    <section className="panel-card diagnostics-panel">
      <div className="panel-card-header">
        <div>
          <div className="panel-kicker">Diagnostics</div>
          <h2>Detection and fixes</h2>
        </div>
        <span className={`panel-chip ${warning ? "warning" : "ready"}`}>{warning ? "Attention" : "Healthy"}</span>
      </div>

      {warning ? <div className="diagnostic-banner">{warning}</div> : null}

      <div className="diagnostic-cards">
        <div className="diagnostic-card">
          <div className="diagnostic-label">Detected language</div>
          <div className="diagnostic-value">{detection ? languageNames[detection.language] ?? detection.language : "Not analyzed yet"}</div>
          <div className="diagnostic-detail">{detection ? `${Math.round(detection.confidence * 100)}% confidence` : "Type code to analyze it."}</div>
        </div>
        <div className="diagnostic-card">
          <div className="diagnostic-label">Signals</div>
          <div className="diagnostic-detail">{detection?.candidates.length ? detection.candidates.map((candidate) => `${languageNames[candidate.language] ?? candidate.language}: ${candidate.score}`).join(" · ") : "Waiting for input"}</div>
        </div>
      </div>

      <div className="diagnostic-fixes">
        {errorInsights.length > 0 ? errorInsights.map((insight) => (
          <article key={`${insight.category}-${insight.title}`} className="fix-card">
            <div className="fix-title">{insight.title}</div>
            <p>{insight.explanation}</p>
            {insight.suggestions.length > 0 ? <ul>{insight.suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul> : null}
          </article>
        )) : (
          <article className="fix-card muted-card">
            <div className="fix-title">No active issues</div>
            <p>Run code to populate targeted suggestions and crash analysis.</p>
          </article>
        )}
      </div>
    </section>
  );
}

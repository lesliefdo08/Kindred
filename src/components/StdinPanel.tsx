interface StdinPanelProps {
  value: string;
  onChange: (value: string) => void;
}

export default function StdinPanel({ value, onChange }: StdinPanelProps) {
  return (
    <section className="panel-card stdin-panel">
      <div className="panel-card-header">
        <div>
          <div className="panel-kicker">Input</div>
          <h2>Program Input (stdin)</h2>
        </div>
        <span className="panel-chip">Terminal-style</span>
      </div>
      <label className="stdin-label" htmlFor="stdin-input">
        Data sent to your program at runtime
      </label>
      <textarea
        id="stdin-input"
        className="stdin-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={"Example:\n42\nhello world\n\nFor input(), scanf(), or Scanner, each value can be on its own line."}
      />
    </section>
  );
}

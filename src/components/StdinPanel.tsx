interface StdinPanelProps {
  value: string;
  onChange: (value: string) => void;
}

export default function StdinPanel({ value, onChange }: StdinPanelProps) {
  return (
    <section className="stdin-panel" aria-label="Program input panel">
      <label className="stdin-label" htmlFor="stdin-input">
        Program Input (stdin)
      </label>
      <textarea
        id="stdin-input"
        className="stdin-input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={"Example:\n42\nhello world\n\nEach line is sent to your program input."}
      />
    </section>
  );
}

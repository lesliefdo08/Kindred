interface WelcomePanelProps {
  recentFiles: string[];
  onInsertExample: (code: string) => void;
}

const examples = [
  {
    title: "Python quick check",
    code: 'print("Hello from Kindred")\n'
  },
  {
    title: "C hello world",
    code: '#include <stdio.h>\nint main(void) {\n  printf("Hello, World!\\n");\n  return 0;\n}\n'
  },
  {
    title: "Java main method",
    code: 'public static void main(String[] args) {\n  System.out.println("Hello from Java");\n}\n'
  }
];

export default function WelcomePanel({ recentFiles, onInsertExample }: WelcomePanelProps) {
  return (
    <section className="panel-card welcome-panel">
      <div className="panel-card-header">
        <div>
          <div className="panel-kicker">Welcome</div>
          <h2>Start fast</h2>
        </div>
        <span className="panel-chip">Kindred</span>
      </div>

      <div className="welcome-section">
        <h3>Recent files</h3>
        {recentFiles.length > 0 ? (
          <ul className="welcome-list">
            {recentFiles.slice(0, 5).map((file) => <li key={file}>{file}</li>)}
          </ul>
        ) : (
          <p className="welcome-copy">No recent files yet. Open a file or pick an example below.</p>
        )}
      </div>

      <div className="welcome-section">
        <h3>Quick examples</h3>
        <div className="example-grid">
          {examples.map((example) => (
            <button key={example.title} type="button" className="example-card" onClick={() => onInsertExample(example.code)}>
              <span>{example.title}</span>
              <small>Insert into editor</small>
            </button>
          ))}
        </div>
      </div>

      <div className="welcome-section">
        <h3>Supported languages</h3>
        <div className="supported-grid">
          <span>Auto</span>
          <span>Python</span>
          <span>C</span>
          <span>Java</span>
        </div>
      </div>
    </section>
  );
}

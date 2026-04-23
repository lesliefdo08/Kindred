import Editor, { useMonaco } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useEffect, useRef } from "react";
import { EditorDiagnostic, SupportedLanguage } from "../types";

interface EditorPaneProps {
  value: string;
  onChange: (value: string) => void;
  language: SupportedLanguage;
  diagnostics?: EditorDiagnostic[];
  onEditorReady?: (editor: Monaco.editor.IStandaloneCodeEditor) => void;
}

function mapMonacoLanguage(language: SupportedLanguage): string {
  switch (language) {
    case "cpp":
      return "cpp";
    case "c":
      return "c";
    case "python":
      return "python";
    case "javascript":
      return "javascript";
    case "java":
      return "java";
    default:
      return "plaintext";
  }
}

function markerSeverity(monaco: typeof Monaco, severity: EditorDiagnostic["severity"]): Monaco.MarkerSeverity {
  switch (severity) {
    case "warning":
      return monaco.MarkerSeverity.Warning;
    case "info":
      return monaco.MarkerSeverity.Info;
    default:
      return monaco.MarkerSeverity.Error;
  }
}

export default function EditorPane({ value, onChange, language, diagnostics = [], onEditorReady }: EditorPaneProps) {
  const monacoRef = useRef<typeof Monaco | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monaco = useMonaco();

  function handleBeforeMount(monaco: typeof Monaco): void {
    monacoRef.current = monaco;
    monaco.editor.defineTheme("kindred-night", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6c758a", fontStyle: "italic" },
        { token: "keyword", foreground: "8fb8ff" },
        { token: "number", foreground: "9ddb8c" },
        { token: "string", foreground: "f0c674" },
        { token: "type.identifier", foreground: "8ce0ff" }
      ],
      colors: {
        "editor.background": "#0f1320",
        "editor.foreground": "#e6edf7",
        "editor.lineHighlightBackground": "#182033",
        "editorLineNumber.foreground": "#54617d",
        "editorCursor.foreground": "#9cc2ff",
        "editor.selectionBackground": "#244466",
        "editor.inactiveSelectionBackground": "#1d2f47"
      }
    });
  }

  useEffect(() => {
    if (monacoRef.current) {
      monacoRef.current.editor.setTheme("kindred-night");
    }
  }, []);

  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      const monacoLanguage = mapMonacoLanguage(language);
      monacoRef.current.editor.setModelLanguage(editorRef.current.getModel()!, monacoLanguage);
    }
  }, [language]);

  useEffect(() => {
    if (!editorRef.current || !monacoRef.current) {
      return;
    }

    const model = editorRef.current.getModel();
    if (!model) {
      return;
    }

    monacoRef.current.editor.setModelMarkers(
      model,
      "kindred-runtime",
      diagnostics.map((diag) => ({
        startLineNumber: diag.line,
        endLineNumber: diag.line,
        startColumn: diag.column ?? 1,
        endColumn: (diag.column ?? 1) + 1,
        message: diag.message,
        severity: markerSeverity(monacoRef.current!, diag.severity)
      }))
    );
  }, [diagnostics]);

  return (
    <div className="editor-pane">
      <Editor
        height="100%"
        beforeMount={handleBeforeMount}
        onMount={(editor) => {
          editorRef.current = editor;
          onEditorReady?.(editor);
        }}
        theme="kindred-night"
        language={mapMonacoLanguage(language)}
        value={value}
        onChange={(nextValue) => onChange(nextValue ?? "")}
        options={{
          minimap: { enabled: false },
          automaticLayout: true,
          fontSize: 14,
          fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, monospace",
          tabSize: 2,
          wordWrap: "on",
          smoothScrolling: true,
          contextmenu: true,
          suggestOnTriggerCharacters: true,
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8
          }
        }}
      />
    </div>
  );
}

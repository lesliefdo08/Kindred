import Editor, { useMonaco } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useEffect, useRef } from "react";
import { EditorDiagnostic, SupportedLanguage } from "../types";

interface EditorPaneProps {
  value: string;
  onChange: (value: string) => void;
  language: SupportedLanguage;
  diagnostics?: EditorDiagnostic[];
  focusLine?: number | null;
  onFocusLineHandled?: () => void;
  fontSize: number;
  placeholder?: string;
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

export default function EditorPane({ value, onChange, language, diagnostics = [], focusLine = null, onFocusLineHandled, fontSize, placeholder, onEditorReady }: EditorPaneProps) {
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
        "editor.background": "#10183a",
        "editor.foreground": "#e8eeff",
        "editor.lineHighlightBackground": "#18224366",
        "editorLineNumber.foreground": "#50607f",
        "editorLineNumber.activeForeground": "#8da0c9",
        "editorCursor.foreground": "#93adff",
        "editor.selectionBackground": "#30519c66",
        "editor.inactiveSelectionBackground": "#263d7560"
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
      editorRef.current.focus();
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

  useEffect(() => {
    if (!editorRef.current || !focusLine || focusLine < 1) {
      return;
    }

    editorRef.current.revealLineInCenter(focusLine);
    editorRef.current.setPosition({ lineNumber: focusLine, column: 1 });
    editorRef.current.focus();
    onFocusLineHandled?.();
  }, [focusLine, onFocusLineHandled]);

  return (
    <div className="editor-pane">
      {!value.trim() && placeholder ? <div className="editor-placeholder">{placeholder}</div> : null}
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
          fontSize,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
          tabSize: 2,
          wordWrap: "off",
          smoothScrolling: true,
          contextmenu: true,
          suggestOnTriggerCharacters: true,
          scrollBeyondLastLine: false,
          renderLineHighlight: "line",
          cursorBlinking: "smooth",
          scrollbar: {
            verticalScrollbarSize: 8,
            horizontalScrollbarSize: 8
          }
        }}
      />
    </div>
  );
}

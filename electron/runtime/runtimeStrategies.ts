import path from "node:path";
import { SupportedLanguage } from "../types";
import { RuntimeKey } from "./runtimeResolver";

export interface RuntimeContext {
  language: SupportedLanguage;
  sourcePath: string;
  workDir: string;
  code: string;
}

export interface RuntimeStrategy {
  language: Exclude<SupportedLanguage, "plaintext">;
  sourceFileName: (code: string) => string;
  requiredRuntimes: RuntimeKey[];
  prepareSource?: (code: string) => { code: string; sourceFileName?: string };
  compileCommand?: {
    runtimeKey: RuntimeKey;
    args: (context: RuntimeContext) => string[];
  };
  runCommand:
    | {
        type: "runtime";
        runtimeKey: RuntimeKey;
        args: (context: RuntimeContext) => string[];
      }
    | {
        type: "binary";
        executable: (context: RuntimeContext) => string;
        args: (context: RuntimeContext) => string[];
      };
}

function getJavaClassName(code: string): string {
  const match = code.match(/public\s+class\s+([A-Za-z_]\w*)/);
  return match ? match[1] : "Main";
}

function getJavaSourceName(code: string): string {
  return `${getJavaClassName(code)}.java`;
}

function wrapJavaMainSnippet(code: string): { code: string; sourceFileName?: string } {
  const hasClass = /\bclass\s+[A-Za-z_]\w*/.test(code);
  const hasMain = /public\s+static\s+void\s+main\s*\(/.test(code);

  if (hasClass || !hasMain) {
    return { code, sourceFileName: getJavaSourceName(code) };
  }

  const lines = code.split(/\r?\n/);
  const header: string[] = [];
  const body: string[] = [];
  let inHeader = true;

  for (const line of lines) {
    if (inHeader && /^\s*(?:package\s+|import\s+)/.test(line)) {
      header.push(line);
      continue;
    }

    inHeader = false;
    body.push(line);
  }

  const wrappedBody = body.join("\n").trimEnd();
  const wrappedSource = [...header, "public class Main {", wrappedBody ? wrappedBody.replace(/^/gm, "  ") : "  public static void main(String[] args) {}", "}"].join("\n");
  return { code: `${wrappedSource}\n`, sourceFileName: "Main.java" };
}

export const runtimeStrategies: Record<Exclude<SupportedLanguage, "plaintext">, RuntimeStrategy> = {
  python: {
    language: "python",
    sourceFileName: () => "main.py",
    requiredRuntimes: ["python"],
    runCommand: {
      type: "runtime",
      runtimeKey: "python",
      args: ({ sourcePath }) => [sourcePath]
    }
  },
  javascript: {
    language: "javascript",
    sourceFileName: () => "main.js",
    requiredRuntimes: ["node"],
    runCommand: {
      type: "runtime",
      runtimeKey: "node",
      args: ({ sourcePath }) => [sourcePath]
    }
  },
  c: {
    language: "c",
    sourceFileName: () => "main.c",
    requiredRuntimes: ["cCompiler"],
    compileCommand: {
      runtimeKey: "cCompiler",
      args: ({ sourcePath, workDir }) => {
        const binaryPath = path.join(workDir, process.platform === "win32" ? "main.exe" : "main");
        return [sourcePath, "-o", binaryPath];
      }
    },
    runCommand: {
      type: "binary",
      executable: ({ workDir }) => path.join(workDir, process.platform === "win32" ? "main.exe" : "main"),
      args: () => []
    }
  },
  cpp: {
    language: "cpp",
    sourceFileName: () => "main.cpp",
    requiredRuntimes: ["cppCompiler"],
    compileCommand: {
      runtimeKey: "cppCompiler",
      args: ({ sourcePath, workDir }) => {
        const binaryPath = path.join(workDir, process.platform === "win32" ? "main.exe" : "main");
        return [sourcePath, "-o", binaryPath];
      }
    },
    runCommand: {
      type: "binary",
      executable: ({ workDir }) => path.join(workDir, process.platform === "win32" ? "main.exe" : "main"),
      args: () => []
    }
  },
  java: {
    language: "java",
    sourceFileName: getJavaSourceName,
    requiredRuntimes: ["javaCompiler", "javaRuntime"],
    prepareSource: wrapJavaMainSnippet,
    compileCommand: {
      runtimeKey: "javaCompiler",
      args: ({ sourcePath }) => [sourcePath]
    },
    runCommand: {
      type: "runtime",
      runtimeKey: "javaRuntime",
      args: ({ workDir, code }) => {
        const className = getJavaClassName(code);
        return ["-cp", workDir, className];
      }
    }
  }
};

import { detectLanguage } from "../electron/languageDetector";
import { analyzeErrorOutput } from "../electron/runtime/errorAnalyzer";

interface DetectionCase {
  name: string;
  filePath: string | null;
  code: string;
  expected: string;
}

interface ErrorCase {
  name: string;
  language: "python" | "javascript" | "c" | "java";
  stderr: string;
  expectedTitle: string;
}

const detectionCases: DetectionCase[] = [
  {
    name: "python-print",
    filePath: "main.py",
    code: "print('hello world')\n",
    expected: "python"
  },
  {
    name: "javascript-console",
    filePath: "app.js",
    code: "console.log('hello');\n",
    expected: "javascript"
  },
  {
    name: "c-stdio",
    filePath: "main.c",
    code: "#include <stdio.h>\nint main(void) { printf(\"hi\\n\"); return 0; }\n",
    expected: "c"
  },
  {
    name: "java-main",
    filePath: "Main.java",
    code: "public class Main { public static void main(String[] args) { System.out.println(\"hi\"); } }\n",
    expected: "java"
  },
  {
    name: "ambiguous-mix",
    filePath: null,
    code: "print('x')\nconsole.log('y')\n",
    expected: "python"
  }
];

const errorCases: ErrorCase[] = [
  {
    name: "python-missing-module",
    language: "python",
    stderr: "ModuleNotFoundError: No module named 'requests'",
    expectedTitle: "Missing Python module"
  },
  {
    name: "javascript-syntax",
    language: "javascript",
    stderr: "SyntaxError: Unexpected token )",
    expectedTitle: "JavaScript syntax error"
  },
  {
    name: "c-compilation",
    language: "c",
    stderr: "main.c:3:5: error: expected ';' before 'return'",
    expectedTitle: "C compilation error"
  }
];

let passed = 0;
const failures: string[] = [];

for (const testCase of detectionCases) {
  const result = detectLanguage(testCase.filePath, testCase.code);
  const ok = result.language === testCase.expected;
  if (ok) {
    passed += 1;
  } else {
    failures.push(`${testCase.name}: expected ${testCase.expected}, got ${result.language} (${result.reason})`);
  }
}

for (const testCase of errorCases) {
  const insights = analyzeErrorOutput(testCase.language, testCase.stderr);
  const ok = insights.some((insight) => insight.title === testCase.expectedTitle);
  if (ok) {
    passed += 1;
  } else {
    failures.push(`${testCase.name}: did not find ${testCase.expectedTitle}`);
  }
}

console.log(`Intelligence harness: ${passed}/${detectionCases.length + errorCases.length} checks passed`);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
}
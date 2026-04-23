import os from "node:os";
import path from "node:path";
import { detectLanguage } from "../electron/languageDetector";
import { runCode } from "../electron/runtime/RuntimeManager";
import { SupportedLanguage } from "../electron/types";

interface HarnessCase {
  name: string;
  code: string;
  mode: "detect" | "run";
  language?: SupportedLanguage;
  expectedDetectedLanguage?: SupportedLanguage;
  expectedAmbiguous?: boolean;
  expectedConfidenceAtLeast?: number;
  expectedOutputIncludes?: string;
  expectedStderrIncludes?: string;
  expectOk?: boolean;
  stdin?: string;
  timeoutMs?: number;
}

const testCases: HarnessCase[] = [
  {
    name: "Python Detection Confidence",
    mode: "detect",
    code: 'def greet():\n    print("Hello")\n\nprint("Hello")\n',
    expectedDetectedLanguage: "python",
    expectedConfidenceAtLeast: 0.6,
    expectedAmbiguous: false
  },
  {
    name: "Mixed Syntax Ambiguity",
    mode: "detect",
    code: '#include <stdio.h>\nprint("Hello")\n',
    expectedDetectedLanguage: "c",
    expectedAmbiguous: true
  },
  {
    name: "Python Hello World",
    mode: "run",
    language: "python",
    code: 'print("Hello from Python")\n',
    expectedOutputIncludes: "Hello from Python"
  },
  {
    name: "C Hello World",
    mode: "run",
    language: "c",
    code: '#include <stdio.h>\n\nint main(void) {\n  printf("Hello from C\\n");\n  return 0;\n}\n',
    expectedOutputIncludes: "Hello from C"
  },
  {
    name: "C Loop Smoke Test",
    mode: "run",
    language: "c",
    code: '#include <stdio.h>\n\nint main(void) {\n  for (int i = 0; i < 3; i++) {\n    printf("%d ", i);\n  }\n  printf("\\n");\n  return 0;\n}\n',
    expectedOutputIncludes: "0 1 2"
  },
  {
    name: "C Scanf Smoke Test",
    mode: "run",
    language: "c",
    code: '#include <stdio.h>\n\nint main(void) {\n  int value = 0;\n  scanf("%d", &value);\n  printf("value=%d\\n", value);\n  return 0;\n}\n',
    expectedOutputIncludes: "value=7",
    stdin: "7\n"
  },
  {
    name: "Java Hello World",
    mode: "run",
    language: "java",
    code: 'public static void main(String[] args) {\n  System.out.println("Hello from Java");\n}\n',
    expectedOutputIncludes: "Hello from Java"
  },
  {
    name: "Java Auto Wrap",
    mode: "run",
    language: "java",
    code: 'public static void main(String[] args) {\n  System.out.println("Auto wrapped Java");\n}\n',
    expectedOutputIncludes: "Auto wrapped Java"
  },
  {
    name: "C Timeout Messaging",
    mode: "run",
    language: "c",
    code: '#include <stdio.h>\n\nint main(void) {\n  while (1) { }\n  return 0;\n}\n',
    expectedStderrIncludes: "Execution stopped: possible infinite loop.",
    expectOk: false,
    timeoutMs: 750
  }
];

async function runHarnessCase(testCase: HarnessCase): Promise<boolean> {
  const cacheRoot = path.join(os.tmpdir(), "kindred-cache");
  const managedRuntimeRoot = path.join(process.cwd(), "managed-runtimes");
  const resourceRoot = process.cwd();

  if (testCase.mode === "detect") {
    const detection = detectLanguage(null, testCase.code);
    const languageOk = testCase.expectedDetectedLanguage ? detection.language === testCase.expectedDetectedLanguage : true;
    const confidenceOk = testCase.expectedConfidenceAtLeast ? detection.confidence >= testCase.expectedConfidenceAtLeast : true;
    const ambiguityOk = typeof testCase.expectedAmbiguous === "boolean" ? detection.isAmbiguous === testCase.expectedAmbiguous : true;
    const passed = languageOk && confidenceOk && ambiguityOk;

    console.log(`\n[${passed ? "PASS" : "FAIL"}] ${testCase.name}`);
    console.log(`Detection: ${detection.language} confidence=${Math.round(detection.confidence * 100)}% ambiguous=${detection.isAmbiguous ? "yes" : "no"}`);

    if (!passed) {
      console.log(`Expected language: ${testCase.expectedDetectedLanguage ?? "(any)"}`);
      console.log(`Expected confidence >= ${testCase.expectedConfidenceAtLeast ?? 0}`);
      console.log(`Expected ambiguous: ${testCase.expectedAmbiguous ?? false}`);
    }

    return passed;
  }

  const result = await runCode(
    {
      language: testCase.language ?? "python",
      code: testCase.code,
      filePath: null,
      stdin: testCase.stdin,
      executionMode: testCase.language ?? "python",
      detectedLanguage: testCase.language ?? "python",
      detectionConfidence: 1,
      isAmbiguous: false
    },
    {
      cacheRoot,
      managedRuntimeRoot,
      appRoot: process.cwd(),
      resourceRoot,
      installMode: "off",
      executionTimeoutMs: testCase.timeoutMs
    }
  );

  const outputOk = testCase.expectedOutputIncludes ? result.stdout.includes(testCase.expectedOutputIncludes) : true;
  const stderrOk = testCase.expectedStderrIncludes ? result.stderr.includes(testCase.expectedStderrIncludes) : true;
  const okOk = typeof testCase.expectOk === "boolean" ? result.ok === testCase.expectOk : result.ok;
  const passed = outputOk && stderrOk && okOk;

  console.log(`\n[${passed ? "PASS" : "FAIL"}] ${testCase.name}`);
  console.log(`Command: ${result.command || "(none)"}`);
  if (!passed) {
    console.log(`Expected stdout includes: ${testCase.expectedOutputIncludes ?? "(any)"}`);
    console.log(`Expected stderr includes: ${testCase.expectedStderrIncludes ?? "(any)"}`);
    console.log(`Expected ok: ${testCase.expectOk ?? true}`);
    console.log(`Exit: ${result.exitCode}`);
    console.log(`stderr: ${result.stderr || "(empty)"}`);
  }

  return passed;
}

async function main(): Promise<void> {
  let passedCount = 0;

  for (const testCase of testCases) {
    const passed = await runHarnessCase(testCase);
    if (passed) {
      passedCount += 1;
    }
  }

  console.log(`\nCore runtime verification: ${passedCount}/${testCases.length} passing`);

  if (passedCount !== testCases.length) {
    process.exit(1);
  }
}

void main();

import { ErrorInsight, SupportedLanguage } from "../types";

interface AnalysisRule {
  language: SupportedLanguage;
  test: RegExp;
  build: (match: RegExpMatchArray, stderr: string) => ErrorInsight;
}

function cleanMessage(message: string): string {
  return message.trim().replace(/\s+/g, " ");
}

function buildInsight(base: ErrorInsight): ErrorInsight {
  return base;
}

const pythonRules: AnalysisRule[] = [
  {
    language: "python",
    test: /ModuleNotFoundError:\s*No module named ['"]([^'"]+)['"]/i,
    build: (match) => ({
      category: "missing-module",
      title: "Missing Python module",
      explanation: `It looks like ${match[1]} is not installed in your environment.`,
      suggestions: [`Try: python -m pip install ${match[1]}`, "Check that you are using the intended virtual environment."],
      probableCause: `Import ${match[1]} could not be resolved on the active interpreter path.`,
      suggestedFix: `Install the missing package with python -m pip install ${match[1]}`
    })
  },
  {
    language: "python",
    test: /ImportError:\s*No module named ['"]([^'"]+)['"]/i,
    build: (match) => ({
      category: "missing-module",
      title: "Missing Python module",
      explanation: `It looks like ${match[1]} is not installed or not available on the current Python path.`,
      suggestions: [`Try: python -m pip install ${match[1]}`, "Check your interpreter and PYTHONPATH."],
      probableCause: `The current Python environment does not expose ${match[1]}.`,
      suggestedFix: `Install the dependency or select the correct interpreter.`
    })
  },
  {
    language: "python",
    test: /SyntaxError:\s*(.+)/i,
    build: (match) => ({
      category: "syntax",
      title: "Python syntax error",
      explanation: cleanMessage(match[1]),
      suggestions: ["Check indentation, parentheses, and colons.", "Look at the line number shown in the traceback."],
      probableCause: "Python parsed a line that does not match the current indentation or token sequence.",
      suggestedFix: "Inspect the line immediately above the reported location for missing colons or mismatched blocks.",
      patchPreview: "# Example\nif condition:\n    print('fixed')"
    })
  }
];

const javascriptRules: AnalysisRule[] = [
  {
    language: "javascript",
    test: /Cannot find module ['"]([^'"]+)['"]/i,
    build: (match) => ({
      category: "missing-module",
      title: "Missing JavaScript module",
      explanation: `It looks like ${match[1]} is not installed in this project.`,
      suggestions: [`Try: npm install ${match[1]}`, "Check the current working directory and package.json."],
      probableCause: `Node could not resolve ${match[1]} from the current working directory.`,
      suggestedFix: `Install the dependency with npm install ${match[1]}.`
    })
  },
  {
    language: "javascript",
    test: /SyntaxError:\s*(.+)/i,
    build: (match) => ({
      category: "syntax",
      title: "JavaScript syntax error",
      explanation: cleanMessage(match[1]),
      suggestions: ["Check braces, commas, and quotes.", "Review the line number in the error output."],
      probableCause: "The parser encountered a token sequence that does not close or separate correctly.",
      suggestedFix: "Verify surrounding braces, trailing commas, and string delimiters.",
      patchPreview: "const value = 1;\nconsole.log(value);"
    })
  }
];

const cRules: AnalysisRule[] = [
  {
    language: "c",
    test: /Execution stopped: possible infinite loop\./i,
    build: () => ({
      category: "runtime",
      title: "Possible infinite loop",
      explanation: "The program was stopped after exceeding the execution timeout.",
      suggestions: ["Check loop conditions and termination paths.", "Add logging or breakpoints to inspect the iteration state."],
      probableCause: "A loop condition never became false or input was not consumed.",
      suggestedFix: "Add a bounded exit condition or inspect the state mutated inside the loop."
    })
  },
  {
    language: "c",
    test: /Program may have crashed \(possible undefined behavior\)\./i,
    build: () => ({
      category: "runtime",
      title: "Possible crash or undefined behavior",
      explanation: "The program exited abnormally and may have hit invalid memory access or undefined behavior.",
      suggestions: ["Check pointer usage, array bounds, and uninitialized values.", "Review recent changes around memory access and function arguments."],
      probableCause: "The program may have dereferenced invalid memory or used an uninitialized value.",
      suggestedFix: "Review pointer ownership, bounds, and initialization before the failing call."
    })
  },
  {
    language: "c",
    test: /([^\n:]+):(\d+):(\d+):\s*error:\s*([^\n]+)/i,
    build: (match) => ({
      category: "compilation",
      title: "C compilation error",
      explanation: `Compilation failed at line ${match[2]}, column ${match[3]}: ${cleanMessage(match[4])}`,
      suggestions: ["Open the referenced line and fix the syntax/type issue.", "Recompile after the change to confirm the fix."],
      probableCause: `The C compiler rejected a token or type at line ${match[2]}.`,
      suggestedFix: "Inspect the line for a missing semicolon, type mismatch, or invalid expression."
    })
  },
  {
    language: "c",
    test: /error:\s*([\s\S]+?)(?:\n|$)/i,
    build: (match, stderr) => ({
      category: "compilation",
      title: "C compilation error",
      explanation: cleanMessage(match[1] || stderr.split("\n")[0] || "Compilation failed."),
      suggestions: ["Check includes, semicolons, and function signatures.", "Review the compiler line/column markers."],
      probableCause: "The compiler produced an error before linking or execution could start.",
      suggestedFix: "Recheck includes, declarations, and the statement immediately before the reported error."
    })
  },
  {
    language: "c",
    test: /undefined reference to ['"]?([^'"\s]+)['"]?/i,
    build: (match) => ({
      category: "compilation",
      title: "Linker error",
      explanation: `The symbol ${match[1]} could not be linked.`,
      suggestions: ["Make sure the function is defined and linked.", "Check that all source files are passed to gcc."],
      probableCause: `A required symbol named ${match[1]} was declared but not linked.`,
      suggestedFix: "Ensure the definition is compiled and linked with the current target."
    })
  }
];

const rules: AnalysisRule[] = [...pythonRules, ...javascriptRules, ...cRules];

function buildGenericInsight(stderr: string): ErrorInsight | null {
  const trimmed = cleanMessage(stderr);
  if (!trimmed) {
    return null;
  }

  return {
    category: "unknown",
    title: "Execution error",
    explanation: trimmed,
    suggestions: ["Review the full stderr output.", "Check the line number and the surrounding code."],
    probableCause: "The runtime returned a non-specific failure without a targeted match.",
    suggestedFix: "Use the stderr details and the nearby source lines to narrow the failure."
  };
}

export function analyzeErrorOutput(language: SupportedLanguage, stderr: string): ErrorInsight[] {
  if (!stderr.trim() || language === "plaintext") {
    return [];
  }

  const insights: ErrorInsight[] = [];
  for (const rule of rules) {
    if (rule.language !== language) {
      continue;
    }

    const match = stderr.match(rule.test);
    if (match) {
      insights.push(rule.build(match, stderr));
    }
  }

  if (insights.length === 0) {
    const generic = buildGenericInsight(stderr);
    if (generic) {
      insights.push(generic);
    }
  }

  return insights;
}

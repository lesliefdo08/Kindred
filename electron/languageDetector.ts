import path from "node:path";
import { DetectionResult, LanguageCandidate, SupportedLanguage } from "./types";

const extensionMap: Record<string, SupportedLanguage> = {
  ".py": "python",
  ".c": "c",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".js": "javascript",
  ".mjs": "javascript",
  ".java": "java"
};

type LanguageScore = Record<SupportedLanguage, number>;

const supportedLanguages: Exclude<SupportedLanguage, "plaintext">[] = ["python", "c", "cpp", "javascript", "java"];

function createScores(): LanguageScore {
  return {
    python: 0,
    c: 0,
    cpp: 0,
    javascript: 0,
    java: 0,
    plaintext: 0
  };
}

function add(scores: LanguageScore, language: Exclude<SupportedLanguage, "plaintext">, value: number): void {
  scores[language] += value;
}

function count(code: string, pattern: RegExp): number {
  return code.match(pattern)?.length ?? 0;
}

function scorePython(code: string, scores: LanguageScore): void {
  add(scores, "python", count(code, /^\s*def\s+[A-Za-z_][\w]*\s*\(/gm) * 6);
  add(scores, "python", count(code, /^\s*(?:from\s+[A-Za-z_][\w.]*\s+import\s+|import\s+[A-Za-z_][\w.,\s]*)/gm) * 4);
  add(scores, "python", count(code, /\bprint\s*\(/g) * 3);
  add(scores, "python", count(code, /^\s*(?:if|elif|else|for|while|try|except|with|class)\b.*:\s*(?:#.*)?$/gm) * 3);
  add(scores, "python", count(code, /^\s{4,}\S/mg) * 1);
  add(scores, "python", count(code, /^\s*[A-Za-z_][\w.]*\s*=\s*(?![=])/gm) * 2);

  const semicolonCount = count(code, /;/g);
  const colonBlockCount = count(code, /^\s*(?:def|class|if|elif|else|for|while|try|except|with)\b.*:\s*(?:#.*)?$/gm);
  if (semicolonCount === 0 && colonBlockCount > 0) {
    add(scores, "python", 3);
  }
}

function scoreC(code: string, scores: LanguageScore): void {
  add(scores, "c", count(code, /^\s*#include\s*[<"].+[>"]\s*$/gm) * 6);
  add(scores, "c", count(code, /\bint\s+main\s*\(/g) * 5);
  add(scores, "c", count(code, /\bprintf\s*\(/g) * 4);
  add(scores, "c", count(code, /\bscanf\s*\(/g) * 4);
  add(scores, "c", count(code, /\b(?:return|sizeof)\b/g) * 1);

  const braceCount = count(code, /[{}]/g);
  const semicolonCount = count(code, /;/g);
  if (braceCount >= 2 && semicolonCount >= 2) {
    add(scores, "c", 3);
  }
}

function scoreJava(code: string, scores: LanguageScore): void {
  add(scores, "java", count(code, /\bpublic\s+class\s+[A-Za-z_][\w]*\b/g) * 6);
  add(scores, "java", count(code, /\bpublic\s+static\s+void\s+main\s*\(/g) * 6);
  add(scores, "java", count(code, /\bSystem\.out\.println\s*\(/g) * 4);
  add(scores, "java", count(code, /\bScanner\b/g) * 3);
}

function scoreCpp(code: string, scores: LanguageScore): void {
  add(scores, "cpp", count(code, /^\s*#include\s*<iostream>\s*$/gm) * 6);
  add(scores, "cpp", count(code, /\bstd::\w+/g) * 3);
  add(scores, "cpp", count(code, /\bcout\s*<</g) * 4);
  add(scores, "cpp", count(code, /\busing\s+namespace\s+std\s*;/g) * 2);
}

function scoreJavaScript(code: string, scores: LanguageScore): void {
  add(scores, "javascript", count(code, /\bconsole\.log\s*\(/g) * 4);
  add(scores, "javascript", count(code, /\bfunction\s+[A-Za-z_][\w]*\s*\(/g) * 3);
  add(scores, "javascript", count(code, /\b(?:const|let|var)\s+[A-Za-z_][\w]*\s*=/g) * 2);
  add(scores, "javascript", count(code, /=>/g) * 2);
}

function buildScores(code: string): LanguageScore {
  const scores = createScores();
  scorePython(code, scores);
  scoreC(code, scores);
  scoreCpp(code, scores);
  scoreJavaScript(code, scores);
  scoreJava(code, scores);

  const semicolonHeavy = count(code, /;/g) >= 3;
  const indentationHeavy = code.split(/\r?\n/).filter((line) => /^\s{4,}\S/.test(line)).length >= 2;
  if (semicolonHeavy && !indentationHeavy) {
    add(scores, "c", 1);
    add(scores, "javascript", 1);
  }

  return scores;
}

function rank(scores: LanguageScore): LanguageCandidate[] {
  return supportedLanguages
    .map((language) => ({ language, score: scores[language] }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score);
}

function confidenceOf(candidates: LanguageCandidate[]): number {
  if (candidates.length === 0) {
    return 0;
  }

  const top = candidates[0].score;
  const total = candidates.reduce((sum, candidate) => sum + candidate.score, 0);
  return total > 0 ? top / total : 0;
}

function extensionLanguage(filePath: string | null): SupportedLanguage | null {
  if (!filePath) {
    return null;
  }

  const extension = path.extname(filePath).toLowerCase();
  return extensionMap[extension] ?? null;
}

export function detectLanguageByExtension(filePath: string): SupportedLanguage {
  return extensionLanguage(filePath) ?? "plaintext";
}

export function detectLanguageByContent(code: string): SupportedLanguage {
  return rank(buildScores(code))[0]?.language ?? "plaintext";
}

export function detectLanguage(filePath: string | null, code: string): DetectionResult {
  const scores = buildScores(code);
  const extLanguage = extensionLanguage(filePath);
  if (extLanguage) {
    add(scores, extLanguage, 1.5);
  }

  const candidates = rank(scores);
  const top = candidates[0];
  const second = candidates[1];
  const confidence = confidenceOf(candidates);
  const lowConfidence = !top || top.score < 5 || confidence < 0.58;
  const ambiguous = Boolean(top && second && second.score > 0 && (top.score - second.score <= 3 || second.score / top.score >= 0.4));

  if (!top) {
    return {
      language: extLanguage ?? "plaintext",
      reason: "fallback",
      isAmbiguous: false,
      confidence: 0,
      candidates: []
    };
  }

  if (ambiguous || lowConfidence) {
    return {
      language: top.language,
      reason: "ambiguous",
      isAmbiguous: true,
      confidence,
      candidates,
      message: "Mixed or ambiguous syntax detected."
    };
  }

  if (extLanguage && extLanguage === top.language) {
    return {
      language: top.language,
      reason: "hybrid",
      isAmbiguous: false,
      confidence,
      candidates
    };
  }

  return {
    language: top.language,
    reason: "content",
    isAmbiguous: false,
    confidence,
    candidates
  };
}
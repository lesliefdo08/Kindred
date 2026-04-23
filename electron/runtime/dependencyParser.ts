import { SupportedLanguage } from "../types";

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function normalizePythonModule(raw: string): string {
  return raw.split(".")[0].trim();
}

function normalizeNodePackage(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("@")) {
    const [scope, pkg] = trimmed.split("/");
    return pkg ? `${scope}/${pkg}` : trimmed;
  }

  return trimmed.split("/")[0];
}

export function parsePythonDependencies(code: string): string[] {
  const dependencies: string[] = [];
  const lines = code.split(/\r?\n/);

  for (const line of lines) {
    const importMatch = line.match(/^\s*import\s+(.+)$/);
    if (importMatch) {
      const parts = importMatch[1].split(",");
      for (const part of parts) {
        const moduleName = part.trim().split(/\s+as\s+/i)[0];
        if (moduleName && !moduleName.startsWith(".")) {
          dependencies.push(normalizePythonModule(moduleName));
        }
      }
      continue;
    }

    const fromMatch = line.match(/^\s*from\s+([\w.]+)\s+import\s+/);
    if (fromMatch) {
      dependencies.push(normalizePythonModule(fromMatch[1]));
    }
  }

  return unique(dependencies);
}

const nodeBuiltinPatterns = new Set(["fs", "path", "os", "url", "util", "events", "crypto", "stream", "http", "https", "zlib", "buffer", "child_process", "timers", "tty", "net", "tls", "dns", "readline", "querystring", "assert", "module", "process", "punycode", "string_decoder", "vm", "worker_threads"]);

function isNodeBuiltin(specifier: string): boolean {
  const normalized = specifier.replace(/^node:/, "").split("/")[0];
  return nodeBuiltinPatterns.has(normalized);
}

export function parseNodeDependencies(code: string): string[] {
  const dependencies: string[] = [];
  const importRegex = /import\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g;
  const requireRegex = /require\(\s*['"]([^'"]+)['"]\s*\)/g;

  for (const match of code.matchAll(importRegex)) {
    const specifier = match[1];
    if (!specifier.startsWith(".") && !specifier.startsWith("/") && !isNodeBuiltin(specifier)) {
      dependencies.push(normalizeNodePackage(specifier));
    }
  }

  for (const match of code.matchAll(requireRegex)) {
    const specifier = match[1];
    if (!specifier.startsWith(".") && !specifier.startsWith("/") && !isNodeBuiltin(specifier)) {
      dependencies.push(normalizeNodePackage(specifier));
    }
  }

  return unique(dependencies);
}

export function parseDependencies(language: SupportedLanguage, code: string): string[] {
  if (language === "python") {
    return parsePythonDependencies(code);
  }

  if (language === "javascript") {
    return parseNodeDependencies(code);
  }

  return [];
}

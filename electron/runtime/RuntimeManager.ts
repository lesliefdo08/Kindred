import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { RunCodeRequest, RunCodeResult } from "../types";
import { DependencyInstallMode, prepareDependencies } from "./dependencyManager";
import { analyzeErrorOutput } from "./errorAnalyzer";
import { ExecutionLogger } from "./executionLogger";
import { DockerExecutionAdapter } from "./containerExecutionAdapter";
import { LocalProcessExecutionAdapter, stopRunningProcesses } from "./localExecutionAdapter";
import { RuntimeContext, runtimeStrategies } from "./runtimeStrategies";
import { resolveRuntimes } from "./runtimeResolver";

export interface RunCodeOptions {
  cacheRoot: string;
  managedRuntimeRoot: string;
  appRoot: string;
  resourceRoot: string;
  installMode?: DependencyInstallMode;
  executionTimeoutMs?: number;
  confirmInstall?: (request: { language: RunCodeRequest["language"]; packages: string[]; cachePath: string }) => Promise<boolean>;
}

const AUTO_CONFIDENCE_THRESHOLD = 0.6;

const processAdapter = new LocalProcessExecutionAdapter();
const containerAdapter = new DockerExecutionAdapter(processAdapter);

function combineStderr(parts: string[]): string {
  return parts.filter((part) => part.trim().length > 0).join("\n");
}

function runtimeResolutionMessage(missing: string[], dockerAvailable: boolean): string {
  const missingLabel = missing.join(", ");
  if (dockerAvailable) {
    return `Missing local/managed runtime(s): ${missingLabel}. Attempting containerized fallback.`;
  }
  return `Missing local/managed runtime(s): ${missingLabel}. Docker fallback is unavailable.`;
}

function commandText(command: string, args: string[]): string {
  return [command, ...args].join(" ");
}

function isLikelyRuntimeCrash(stderr: string, exitCode: number): boolean {
  return exitCode !== 0 && /(segmentation fault|access violation|stack overflow|stack smashing detected|core dumped|abort|undefined behavior)/i.test(stderr);
}

function runtimeCrashMessage(language: RunCodeRequest["language"], stderr: string, exitCode: number): string | null {
  if (language !== "c") {
    return null;
  }

  if (isLikelyRuntimeCrash(stderr, exitCode)) {
    return "Program may have crashed (possible undefined behavior).";
  }

  if (exitCode !== 0 && stderr.trim().length === 0) {
    return "Program may have crashed (possible undefined behavior).";
  }

  return null;
}

async function runForLanguage(
  language: RunCodeRequest["language"],
  request: RunCodeRequest,
  options: RunCodeOptions,
  startedAt: number,
  logger: ExecutionLogger,
  runtimeNotice: string,
  validation: { ok: boolean; missingCommands: string[] }
): Promise<RunCodeResult> {
  const strategy = runtimeStrategies[language];
  const executionTimeoutMs = options.executionTimeoutMs ?? 30000;
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "kindred-"));
  const preparedSource = strategy.prepareSource?.(request.code) ?? { code: request.code };
  const sourceFileName = preparedSource.sourceFileName ?? strategy.sourceFileName(request.code);
  const sourcePath = path.join(tmpDir, sourceFileName);
  logger.log("prepare-workspace", `Created temp workspace at ${tmpDir}`);

  try {
    await fs.writeFile(sourcePath, preparedSource.code, "utf-8");
    logger.log("write-source", `Wrote source file ${sourceFileName}`);

    const context: RuntimeContext = {
      language,
      sourcePath,
      workDir: tmpDir,
      code: preparedSource.code
    };

    const resolution = await resolveRuntimes(strategy.requiredRuntimes, {
      managedRuntimeRoot: options.managedRuntimeRoot,
      appRoot: options.appRoot,
      resourceRoot: options.resourceRoot
    });

    for (const attempt of resolution.attempts) {
      logger.log("runtime-attempt", `${attempt.key} via ${attempt.source}: ${attempt.detail}`);
    }

    const dependencyResolution = await prepareDependencies({
      language,
      code: preparedSource.code,
      cacheRoot: options.cacheRoot,
      workDir: tmpDir,
      installMode: options.installMode ?? "prompt",
      confirmInstall: options.confirmInstall,
      logger,
      pythonCommand: resolution.resolved.python ? { command: resolution.resolved.python.command, argsPrefix: resolution.resolved.python.argsPrefix } : undefined
    });

    if (!dependencyResolution.ok) {
      const stderr = dependencyResolution.message ?? `Missing dependency(ies): ${dependencyResolution.missing.join(", ")}`;
      return {
        ok: false,
        command: "",
        stdout: "",
        stderr,
        exitCode: 1,
        durationMs: Date.now() - startedAt,
        validation,
        logs: logger.entries(),
        errorInsights: analyzeErrorOutput(language, stderr)
      };
    }

    if (!resolution.ok) {
      if (!resolution.dockerAvailable) {
        const stderr = runtimeResolutionMessage(resolution.missingKeys, false);
        logger.log("runtime-resolution-failed", stderr);
        return {
          ok: false,
          command: "",
          stdout: "",
          stderr,
          exitCode: 1,
          durationMs: Date.now() - startedAt,
          validation,
          logs: logger.entries(),
          errorInsights: analyzeErrorOutput(language, stderr)
        };
      }

      const containerResult = await containerAdapter.execute(language, context);
      const crashNote = runtimeCrashMessage(language, containerResult.stderr, containerResult.exitCode);
      const combinedStderr = combineStderr([runtimeNotice, crashNote ?? "", containerResult.stderr]);
      logger.log("container-execution", containerResult.command || "Container fallback attempted");
      return {
        ok: containerResult.ok,
        command: containerResult.command,
        stdout: containerResult.stdout,
        stderr: combinedStderr,
        exitCode: containerResult.exitCode,
        durationMs: Date.now() - startedAt,
        validation,
        logs: logger.entries(),
        errorInsights: analyzeErrorOutput(language, combinedStderr)
      };
    }

    let compileStdout = "";
    let compileStderr = "";

    if (strategy.compileCommand) {
      const compiler = resolution.resolved[strategy.compileCommand.runtimeKey];
      if (!compiler) {
        const stderr = `Compiler runtime ${strategy.compileCommand.runtimeKey} could not be resolved.`;
        return {
          ok: false,
          command: "",
          stdout: "",
          stderr,
          exitCode: 1,
          durationMs: Date.now() - startedAt,
          validation,
          logs: logger.entries(),
          errorInsights: analyzeErrorOutput(language, stderr)
        };
      }

      const compileArgs = [...compiler.argsPrefix, ...strategy.compileCommand.args(context)];
      logger.log("compile", commandText(compiler.command, compileArgs));
      const compileResult = await processAdapter.execute(compiler.command, compileArgs, tmpDir, {
        env: { ...process.env, ...dependencyResolution.env },
        timeoutMs: language === "c" || language === "cpp" ? 120000 : 30000,
        stdin: request.stdin
      });

      if (compileResult.exitCode !== 0) {
        logger.log("compile-failed", compileResult.stderr || "Compilation failed");
        return {
          ok: false,
          command: commandText(compiler.command, compileArgs),
          stdout: compileResult.stdout,
          stderr: combineStderr([runtimeNotice, compileResult.stderr]),
          exitCode: compileResult.exitCode,
          durationMs: Date.now() - startedAt,
          validation,
          logs: logger.entries(),
          errorInsights: analyzeErrorOutput(language, compileResult.stderr)
        };
      }

      compileStdout = compileResult.stdout;
      compileStderr = compileResult.stderr;
      logger.log("compile-success", "Compilation completed successfully");
    }

    let runCommand = "";
    let runArgs: string[] = [];

    if (strategy.runCommand.type === "runtime") {
      const runtime = resolution.resolved[strategy.runCommand.runtimeKey];
      if (!runtime) {
        const stderr = `Runtime ${strategy.runCommand.runtimeKey} could not be resolved.`;
        return {
          ok: false,
          command: "",
          stdout: "",
          stderr,
          exitCode: 1,
          durationMs: Date.now() - startedAt,
          validation,
          logs: logger.entries(),
          errorInsights: analyzeErrorOutput(language, stderr)
        };
      }

      runCommand = runtime.command;
      runArgs = [...runtime.argsPrefix, ...strategy.runCommand.args(context)];
    } else {
      runCommand = strategy.runCommand.executable(context);
      runArgs = strategy.runCommand.args(context);
    }

    logger.log("execute", commandText(runCommand, runArgs));
    const runResult = await processAdapter.execute(runCommand, runArgs, tmpDir, {
      env: { ...process.env, ...dependencyResolution.env },
      timeoutMs: executionTimeoutMs,
      stdin: request.stdin
    });

    const crashNote = runtimeCrashMessage(language, runResult.stderr, runResult.exitCode);
    const stderr = combineStderr([runtimeNotice, compileStderr, crashNote ?? "", runResult.stderr]);

    if (runResult.exitCode === 0) {
      logger.log("execute-success", "Execution completed successfully");
    } else if (runResult.exitCode === 124) {
      logger.log("execute-timeout", "Execution stopped: possible infinite loop.");
    } else if (crashNote) {
      logger.log("execute-crash", crashNote);
    } else {
      logger.log("execute-failed", runResult.stderr || "Execution failed");
    }

    return {
      ok: runResult.exitCode === 0,
      command: commandText(runCommand, runArgs),
      stdout: `${compileStdout}${runResult.stdout}`,
      stderr,
      exitCode: runResult.exitCode,
      durationMs: Date.now() - startedAt,
      validation,
      logs: logger.entries(),
      errorInsights: analyzeErrorOutput(language, stderr)
    };
  } finally {
    logger.log("cleanup", `Removing temp workspace ${tmpDir}`);
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
}

export async function runCode(request: RunCodeRequest, options: RunCodeOptions): Promise<RunCodeResult> {
  const startedAt = Date.now();
  const logger = new ExecutionLogger();
  const strategy = request.language === "plaintext" ? undefined : runtimeStrategies[request.language];

  if (!strategy) {
    return {
      ok: false,
      command: "",
      stdout: "",
      stderr: `Language ${request.language} is not executable in this phase.`,
      exitCode: 1,
      durationMs: Date.now() - startedAt,
      validation: {
        ok: false,
        missingCommands: []
      },
      logs: logger.entries(),
      errorInsights: []
    };
  }

  const executionMode = request.executionMode ?? "auto";
  const lowConfidenceAuto = executionMode === "auto" && ((request.detectionConfidence ?? 1) < AUTO_CONFIDENCE_THRESHOLD || Boolean(request.isAmbiguous));
  const fallbackDetectedLanguage = request.detectedLanguage && request.detectedLanguage !== "python" ? request.detectedLanguage : undefined;
  const preferredLanguages: RunCodeRequest["language"][] = lowConfidenceAuto
    ? ["python", ...(fallbackDetectedLanguage && fallbackDetectedLanguage !== request.language ? [fallbackDetectedLanguage] : request.language === "python" ? [] : [request.language])]
    : [request.language];
  const validation = {
    ok: true,
    missingCommands: [] as string[]
  };

  logger.log("resolve-strategy", `Resolving runtime for ${request.language}`);

  let lastResult: RunCodeResult | null = null;
  for (const candidateLanguage of preferredLanguages) {
    const candidateStrategy = runtimeStrategies[candidateLanguage];
    const candidateResult = await runForLanguage(candidateLanguage, request, options, startedAt, logger, lowConfidenceAuto ? "Mixed or ambiguous syntax detected." : "", validation);
    lastResult = candidateResult;

    if (candidateResult.ok) {
      return candidateResult;
    }

    if (!(lowConfidenceAuto && candidateLanguage === "python" && preferredLanguages.length > 1)) {
      return candidateResult;
    }

    logger.log("auto-fallback", `Python fallback failed; trying ${request.language} next.`);
  }

  return lastResult ?? {
    ok: false,
    command: "",
    stdout: "",
    stderr: "Execution failed.",
    exitCode: 1,
    durationMs: Date.now() - startedAt,
    validation,
    logs: logger.entries(),
    errorInsights: analyzeErrorOutput(request.language, "Execution failed.")
  };
}

export function stopExecution(): { stopped: boolean } {
  return { stopped: stopRunningProcesses() };
}

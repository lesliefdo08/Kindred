import { spawn, ChildProcess } from "node:child_process";

const activeChildren = new Set<ChildProcess>();
let streamingChild: ChildProcess | null = null;

export function stopRunningProcesses(): boolean {
  if (activeChildren.size === 0) {
    return false;
  }

  for (const child of activeChildren) {
    try {
      child.kill();
    } catch {
      // Ignore individual kill failures and continue stopping remaining children.
    }
  }
  streamingChild = null;

  return true;
}

export function writeToRunningProcess(data: string): boolean {
  if (!streamingChild || streamingChild.killed || !streamingChild.stdin?.writable) {
    return false;
  }
  try {
    streamingChild.stdin.write(data);
    return true;
  } catch {
    return false;
  }
}

export interface CommandExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface ExecuteOptions {
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  stdin?: string;
}

export interface StreamCallbacks {
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

export interface ExecutionAdapter {
  execute(command: string, args: string[], cwd: string, options?: ExecuteOptions, streamCallbacks?: StreamCallbacks): Promise<CommandExecutionResult>;
}

export class LocalProcessExecutionAdapter implements ExecutionAdapter {
  async execute(command: string, args: string[], cwd: string, options?: ExecuteOptions, streamCallbacks?: StreamCallbacks): Promise<CommandExecutionResult> {
    return new Promise((resolve) => {
      const useShell = process.platform === "win32" && /^(py|python)(?:\.exe)?$/i.test(command.trim());
      const launchCommand = useShell && /\s/.test(command) ? `"${command.replace(/"/g, '\\"')}"` : command;
      const child = spawn(launchCommand, args, {
        cwd,
        env: options?.env,
        shell: useShell,
        windowsHide: true
      });
      activeChildren.add(child);

      const isStreaming = Boolean(streamCallbacks);
      if (isStreaming) {
        streamingChild = child;
      }

      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timeoutMs = options?.timeoutMs ?? 15000;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;
        streamCallbacks?.onStdout?.(text);
      });

      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        streamCallbacks?.onStderr?.(text);
      });

      // If not streaming, write all stdin at once (batch mode)
      if (!isStreaming) {
        child.stdin.end(options?.stdin ?? "");
      }

      child.on("error", (error) => {
        clearTimeout(timer);
        activeChildren.delete(child);
        if (streamingChild === child) streamingChild = null;
        resolve({
          stdout,
          stderr: error.message,
          exitCode: 1
        });
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        activeChildren.delete(child);
        if (streamingChild === child) streamingChild = null;
        resolve({
          stdout,
          stderr: timedOut ? `${stderr}\nExecution stopped: possible infinite loop. Process timed out after ${timeoutMs}ms.` : stderr,
          exitCode: timedOut ? 124 : (code ?? 1)
        });
      });
    });
  }
}

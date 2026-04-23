import { spawn } from "node:child_process";

const activeChildren = new Set<ReturnType<typeof spawn>>();

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

  return true;
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

export interface ExecutionAdapter {
  execute(command: string, args: string[], cwd: string, options?: ExecuteOptions): Promise<CommandExecutionResult>;
}

export class LocalProcessExecutionAdapter implements ExecutionAdapter {
  async execute(command: string, args: string[], cwd: string, options?: ExecuteOptions): Promise<CommandExecutionResult> {
    return new Promise((resolve) => {
      const child = spawn(command, args, {
        cwd,
        env: options?.env,
        shell: false,
        windowsHide: true
      });
      activeChildren.add(child);

      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const timeoutMs = options?.timeoutMs ?? 15000;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stdin.end(options?.stdin ?? "");

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        clearTimeout(timer);
        activeChildren.delete(child);
        resolve({
          stdout,
          stderr: error.message,
          exitCode: 1
        });
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        activeChildren.delete(child);
        resolve({
          stdout,
          stderr: timedOut ? `${stderr}\nExecution stopped: possible infinite loop. Process timed out after ${timeoutMs}ms.` : stderr,
          exitCode: timedOut ? 124 : (code ?? 1)
        });
      });
    });
  }
}

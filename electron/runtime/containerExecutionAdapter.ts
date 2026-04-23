import { LocalProcessExecutionAdapter } from "./localExecutionAdapter";
import { RuntimeContext } from "./runtimeStrategies";

export interface ContainerExecutionResult {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

function toDockerMountPath(hostPath: string): string {
  return hostPath.replace(/\\/g, "/");
}

export class DockerExecutionAdapter {
  constructor(private readonly processAdapter: LocalProcessExecutionAdapter) {}

  async execute(language: RuntimeContext["language"], context: RuntimeContext): Promise<ContainerExecutionResult> {
    const mountPath = `${toDockerMountPath(context.workDir)}:/work`;
    const sourceFile = context.sourcePath.split(/[/\\]/).pop() ?? "main.py";

    if (language === "python") {
      const command = "docker";
      const args = ["run", "--rm", "-v", mountPath, "-w", "/work", "python:3.12", "python", `/work/${sourceFile}`];
      const result = await this.processAdapter.execute(command, args, context.workDir, { env: process.env });
      return {
        ok: result.exitCode === 0,
        command: [command, ...args].join(" "),
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode
      };
    }

    if (language === "c") {
      const cSourceFile = context.sourcePath.split(/[/\\]/).pop() ?? "main.c";
      const shell = `gcc "${cSourceFile}" -o main && ./main`;
      const command = "docker";
      const args = ["run", "--rm", "-v", mountPath, "-w", "/work", "gcc:14", "bash", "-lc", shell];
      const result = await this.processAdapter.execute(command, args, context.workDir, { env: process.env });
      return {
        ok: result.exitCode === 0,
        command: [command, ...args].join(" "),
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode
      };
    }

    if (language === "java") {
      const javaSourceFile = context.sourcePath.split(/[/\\]/).pop() ?? "Main.java";
      const className = javaSourceFile.replace(/\.java$/, "");
      const shell = `javac "${javaSourceFile}" && java ${className}`;
      const command = "docker";
      const args = ["run", "--rm", "-v", mountPath, "-w", "/work", "eclipse-temurin:21", "bash", "-lc", shell];
      const result = await this.processAdapter.execute(command, args, context.workDir, { env: process.env });
      return {
        ok: result.exitCode === 0,
        command: [command, ...args].join(" "),
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode
      };
    }

    return {
      ok: false,
      command: "",
      stdout: "",
      stderr: `Container fallback is not configured for ${language}`,
      exitCode: 1
    };
  }
}

import { ExecutionLogEntry } from "../types";

export class ExecutionLogger {
  private readonly logs: ExecutionLogEntry[] = [];

  log(step: string, detail: string): void {
    this.logs.push({
      at: new Date().toISOString(),
      step,
      detail
    });
  }

  entries(): ExecutionLogEntry[] {
    return [...this.logs];
  }
}

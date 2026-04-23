import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { RuntimeValidationResult } from "../types";

const exec = promisify(execCb);

async function commandExists(commandName: string): Promise<boolean> {
  const checkCommand = process.platform === "win32" ? `where ${commandName}` : `command -v ${commandName}`;
  try {
    await exec(checkCommand, { timeout: 4000 });
    return true;
  } catch {
    return false;
  }
}

export async function validateRuntime(requiredCommands: string[]): Promise<RuntimeValidationResult> {
  const results = await Promise.all(
    requiredCommands.map(async (commandName) => ({
      commandName,
      exists: await commandExists(commandName)
    }))
  );

  const missingCommands = results.filter((item) => !item.exists).map((item) => item.commandName);
  return {
    ok: missingCommands.length === 0,
    missingCommands
  };
}

import { execSync } from "node:child_process";
import { classifyExecute } from "../guards/classify.js";

export interface SafeExecuteInput {
  command: string;
  confirm?: boolean;
}

export interface SafeExecuteResult {
  ok: boolean;
  message: string;
}

const TIMEOUT_MS = 30_000;

export function safeExecute(input: SafeExecuteInput): SafeExecuteResult {
  const { command, confirm = false } = input;
  const verdict = classifyExecute(command);

  if (verdict.verdict === "block") {
    return { ok: false, message: `BLOCKED: ${verdict.reasons.join(" ")}` };
  }
  if (verdict.verdict === "confirm" && !confirm) {
    return { ok: false, message: `CONFIRMATION REQUIRED: ${verdict.reasons.join(" ")}` };
  }

  try {
    const output = execSync(command, { timeout: TIMEOUT_MS, encoding: "utf8" });
    return { ok: true, message: output };
  } catch (err) {
    const e = err as Error;
    return { ok: false, message: `Command failed: ${e.message}` };
  }
}

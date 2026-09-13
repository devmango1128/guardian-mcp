import fs from "node:fs";
import { classifyDelete } from "../guards/classify.js";
import { moveToQuarantine } from "./quarantine.js";

export interface SafeDeleteInput {
  path: string;
  confirm?: boolean;
}

export interface SafeDeleteResult {
  ok: boolean;
  message: string;
}

export function safeDelete(input: SafeDeleteInput): SafeDeleteResult {
  const { path: targetPath, confirm = false } = input;

  if (!fs.existsSync(targetPath)) {
    return { ok: false, message: `Path does not exist: ${targetPath}` };
  }

  const verdict = classifyDelete(targetPath);

  if (verdict.verdict === "block") {
    return { ok: false, message: `BLOCKED: ${verdict.reasons.join(" ")}` };
  }
  if (verdict.verdict === "confirm" && !confirm) {
    return { ok: false, message: `CONFIRMATION REQUIRED: ${verdict.reasons.join(" ")}` };
  }

  const quarantined = moveToQuarantine(targetPath);
  return { ok: true, message: `Moved to quarantine (recoverable): ${quarantined}` };
}

import fs from "node:fs";
import path from "node:path";
import { classifyWrite } from "../guards/classify.js";
import { moveToQuarantine } from "./quarantine.js";

export interface SafeWriteInput {
  path: string;
  content: string;
  overwrite?: boolean;
}

export interface SafeWriteResult {
  ok: boolean;
  message: string;
}

export function safeWrite(input: SafeWriteInput): SafeWriteResult {
  const { path: targetPath, content, overwrite = false } = input;

  const verdict = classifyWrite(targetPath);
  if (verdict.verdict === "block") {
    return { ok: false, message: `BLOCKED: ${verdict.reasons.join(" ")}` };
  }

  const exists = fs.existsSync(targetPath);
  if (exists && !overwrite) {
    return { ok: false, message: `File already exists: ${targetPath}. Retry with overwrite:true to replace it.` };
  }

  let backupMessage = "";
  if (exists) {
    const backup = moveToQuarantine(targetPath);
    backupMessage = ` (previous version backed up to ${backup})`;
  } else {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  }

  fs.writeFileSync(targetPath, content, "utf8");
  return { ok: true, message: `Wrote ${targetPath}${backupMessage}` };
}

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { classifyWrite } from "../guards/classify.js";
import { lexists } from "../guards/fsUtil.js";
import { moveToQuarantine, restoreFromQuarantine, type QuarantineRecord } from "./quarantine.js";

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

  const exists = lexists(targetPath);
  if (exists && !overwrite) {
    return { ok: false, message: `File already exists: ${targetPath}. Retry with overwrite:true to replace it.` };
  }

  let backup: QuarantineRecord | undefined;
  if (exists) {
    backup = moveToQuarantine(targetPath, "write-backup");
  } else {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  }

  const tmpPath = `${targetPath}.guardian-tmp-${crypto.randomUUID()}`;
  try {
    fs.writeFileSync(tmpPath, content, "utf8");
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    try {
      if (lexists(tmpPath)) fs.rmSync(tmpPath, { force: true });
    } catch {}

    if (backup) {
      const restored = restoreFromQuarantine(backup.id);
      if (restored.ok) {
        return { ok: false, message: `Write failed (${(err as Error).message}). Original file was restored from backup.` };
      }
      return {
        ok: false,
        message: `Write failed (${(err as Error).message}), AND restoring the backup also failed (${restored.message}). Backup is still available at ${backup.quarantinedPath} (id=${backup.id}).`,
      };
    }
    return { ok: false, message: `Write failed: ${(err as Error).message}` };
  }

  const backupMessage = backup ? ` (previous version backed up, id=${backup.id}: ${backup.quarantinedPath})` : "";
  return { ok: true, message: `Wrote ${targetPath}${backupMessage}` };
}

import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { lexists } from "../guards/fsUtil.js";

export type QuarantineType = "file" | "directory" | "symlink" | "other";
export type QuarantineOperation = "delete" | "write-backup";

export interface QuarantineRecord {
  id: string;
  originalPath: string;
  quarantinedPath: string;
  timestamp: string;
  type: QuarantineType;
  size?: number;
  operation: QuarantineOperation;
}

function trashDir(): string {
  const override = process.env.GUARDIAN_TRASH_DIR;
  return override ? path.resolve(override) : path.join(os.homedir(), ".guardian-mcp", "trash");
}

function indexPath(): string {
  return path.join(trashDir(), "index.json");
}

function readIndex(): QuarantineRecord[] {
  fs.mkdirSync(trashDir(), { recursive: true });
  if (!fs.existsSync(indexPath())) return [];
  try {
    const raw = fs.readFileSync(indexPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("index.json does not contain an array");
    return parsed as QuarantineRecord[];
  } catch {
    const corruptBackup = `${indexPath()}.corrupt-${Date.now()}`;
    try {
      fs.renameSync(indexPath(), corruptBackup);
    } catch {}
    return [];
  }
}

function writeIndex(records: QuarantineRecord[]): void {
  fs.mkdirSync(trashDir(), { recursive: true });
  const tmp = `${indexPath()}.tmp-${crypto.randomUUID()}`;
  fs.writeFileSync(tmp, JSON.stringify(records, null, 2), "utf8");
  fs.renameSync(tmp, indexPath());
}

function moveEntry(from: string, to: string): void {
  try {
    fs.renameSync(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EXDEV") {
      fs.cpSync(from, to, { recursive: true });
      fs.rmSync(from, { recursive: true, force: true });
    } else {
      throw err;
    }
  }
}

export function moveToQuarantine(targetPath: string, operation: QuarantineOperation = "delete"): QuarantineRecord {
  fs.mkdirSync(trashDir(), { recursive: true });

  const stat = fs.lstatSync(targetPath);
  const type: QuarantineType = stat.isSymbolicLink() ? "symlink" : stat.isDirectory() ? "directory" : stat.isFile() ? "file" : "other";

  const id = crypto.randomUUID();
  const dest = path.join(trashDir(), `${id}-${path.basename(targetPath)}`);
  moveEntry(targetPath, dest);

  const record: QuarantineRecord = {
    id,
    originalPath: targetPath,
    quarantinedPath: dest,
    timestamp: new Date().toISOString(),
    type,
    size: type === "file" ? stat.size : undefined,
    operation,
  };

  const records = readIndex();
  records.push(record);
  writeIndex(records);
  return record;
}

export function listQuarantine(): QuarantineRecord[] {
  return readIndex();
}

export function restoreFromQuarantine(id: string): { ok: boolean; message: string } {
  const records = readIndex();
  const idx = records.findIndex((r) => r.id === id);
  if (idx === -1) {
    return { ok: false, message: `No quarantine record found for id "${id}".` };
  }

  const record = records[idx];
  if (lexists(record.originalPath)) {
    return {
      ok: false,
      message: `Cannot restore "${id}": something already exists at "${record.originalPath}". Move or remove it first, then retry.`,
    };
  }
  if (!lexists(record.quarantinedPath)) {
    records.splice(idx, 1);
    writeIndex(records);
    return { ok: false, message: `Quarantined item for "${id}" is missing on disk (already purged?). Removed stale record.` };
  }

  fs.mkdirSync(path.dirname(record.originalPath), { recursive: true });
  try {
    moveEntry(record.quarantinedPath, record.originalPath);
  } catch (err) {
    return { ok: false, message: `Restore failed: ${(err as Error).message}` };
  }

  records.splice(idx, 1);
  writeIndex(records);
  return { ok: true, message: `Restored "${record.originalPath}" from quarantine.` };
}

export interface PurgeOptions {
  ids?: string[];
  olderThanDays?: number;
  dryRun?: boolean;
  confirm?: boolean;
}

export interface PurgeResult {
  ok: boolean;
  message: string;
  purged: QuarantineRecord[];
}

const PURGE_CONFIRM_THRESHOLD = 20;

export function purgeQuarantine(opts: PurgeOptions = {}): PurgeResult {
  const records = readIndex();

  if (!opts.ids && opts.olderThanDays === undefined) {
    return { ok: false, message: "Refusing to purge: no criteria given. Pass ids or olderThanDays explicitly.", purged: [] };
  }

  const now = Date.now();
  const matched = records.filter((r) => {
    if (opts.ids && !opts.ids.includes(r.id)) return false;
    if (opts.olderThanDays !== undefined) {
      const ageDays = (now - new Date(r.timestamp).getTime()) / 86_400_000;
      if (ageDays < opts.olderThanDays) return false;
    }
    return true;
  });

  if (opts.dryRun) {
    return { ok: true, message: `Dry run: would purge ${matched.length} item(s).`, purged: matched };
  }

  if (matched.length > PURGE_CONFIRM_THRESHOLD && !opts.confirm) {
    return {
      ok: false,
      message: `CONFIRMATION REQUIRED: this would permanently purge ${matched.length} item(s) (over the safety threshold of ${PURGE_CONFIRM_THRESHOLD}). Re-run with confirm:true to proceed.`,
      purged: [],
    };
  }

  const matchedIds = new Set(matched.map((r) => r.id));
  const remaining = records.filter((r) => !matchedIds.has(r.id));

  for (const r of matched) {
    try {
      fs.rmSync(r.quarantinedPath, { recursive: true, force: true });
    } catch {}
  }
  writeIndex(remaining);

  return { ok: true, message: `Purged ${matched.length} item(s) from quarantine.`, purged: matched };
}

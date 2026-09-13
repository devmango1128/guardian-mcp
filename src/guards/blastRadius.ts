import fs from "node:fs";
import path from "node:path";
import { allow, confirm, type ClassifyResult } from "./types.js";

export interface BlastRadius {
  fileCount: number;
  totalBytes: number;
  truncated: boolean;
}

const DEFAULT_MAX_FILES = 100;
const DEFAULT_MAX_BYTES = 1_000_000_000;

function maxFiles(): number {
  const raw = Number(process.env.GUARDIAN_MAX_FILES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_FILES;
}

function maxBytes(): number {
  const raw = Number(process.env.GUARDIAN_MAX_BYTES);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_BYTES;
}

export function measureBlastRadius(targetPath: string, limits: { maxFiles: number; maxBytes: number }): BlastRadius {
  let fileCount = 0;
  let totalBytes = 0;
  let truncated = false;

  const stack: string[] = [targetPath];
  while (stack.length > 0) {
    if (fileCount > limits.maxFiles || totalBytes > limits.maxBytes) {
      truncated = true;
      break;
    }
    const current = stack.pop()!;
    let stat: fs.Stats;
    try {
      stat = fs.lstatSync(current);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      let entries: string[] = [];
      try {
        entries = fs.readdirSync(current);
      } catch {
        continue;
      }
      for (const entry of entries) stack.push(path.join(current, entry));
    } else {
      fileCount += 1;
      totalBytes += stat.size;
    }
  }

  return { fileCount, totalBytes, truncated };
}

export function classifyBlastRadius(targetPath: string): ClassifyResult {
  if (!fs.existsSync(targetPath)) return allow();

  const limits = { maxFiles: maxFiles(), maxBytes: maxBytes() };
  const radius = measureBlastRadius(targetPath, limits);

  if (radius.fileCount > limits.maxFiles || radius.totalBytes > limits.maxBytes || radius.truncated) {
    return confirm(
      `Target affects ${radius.fileCount}${radius.truncated ? "+" : ""} file(s) / ` +
        `${(radius.totalBytes / 1_000_000).toFixed(1)}${radius.truncated ? "+" : ""}MB, ` +
        `above the configured threshold (${limits.maxFiles} files / ${(limits.maxBytes / 1_000_000).toFixed(0)}MB). ` +
        `Re-run with confirm:true to proceed.`,
    );
  }
  return allow();
}

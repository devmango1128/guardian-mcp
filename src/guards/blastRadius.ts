import fs from "node:fs";
import path from "node:path";
import { allow, confirm, type ClassifyResult } from "./types.js";
import { lexists } from "./fsUtil.js";

export interface BlastRadius {
  fileCount: number;
  totalBytes: number;
  truncated: boolean;
  errors: string[];
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
  const errors: string[] = [];

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
    } catch (err) {
      errors.push(`Could not stat "${current}": ${(err as Error).message}`);
      continue;
    }

    if (stat.isDirectory()) {
      let entries: string[] = [];
      try {
        entries = fs.readdirSync(current);
      } catch (err) {
        errors.push(`Could not list "${current}": ${(err as Error).message}`);
        continue;
      }
      for (const entry of entries) stack.push(path.join(current, entry));
    } else {
      fileCount += 1;
      totalBytes += stat.size;
    }
  }

  return { fileCount, totalBytes, truncated, errors };
}

export function classifyBlastRadius(targetPath: string): ClassifyResult {
  if (!lexists(targetPath)) return allow();

  const limits = { maxFiles: maxFiles(), maxBytes: maxBytes() };
  const radius = measureBlastRadius(targetPath, limits);

  const overThreshold = radius.fileCount > limits.maxFiles || radius.totalBytes > limits.maxBytes || radius.truncated;
  const hadErrors = radius.errors.length > 0;

  if (!overThreshold && !hadErrors) return allow();

  const parts: string[] = [];
  if (overThreshold) {
    parts.push(
      `affects ${radius.fileCount}${radius.truncated ? "+" : ""} file(s) / ` +
        `${(radius.totalBytes / 1_000_000).toFixed(1)}${radius.truncated ? "+" : ""}MB ` +
        `(threshold ${limits.maxFiles} files / ${(limits.maxBytes / 1_000_000).toFixed(0)}MB)`,
    );
  }
  if (hadErrors) {
    const shown = radius.errors.slice(0, 3).join("; ");
    parts.push(`could not fully measure the target (${radius.errors.length} error(s): ${shown}${radius.errors.length > 3 ? "; ..." : ""})`);
  }

  return confirm(`Target ${parts.join(" and ")}. Re-run with confirm:true to proceed.`);
}

import os from "node:os";
import path from "node:path";
import { allow, block, type ClassifyResult } from "./types.js";

const homedir = os.homedir();

const CRITICAL_EXACT_PATHS = [
  "/",
  "/System",
  "/Library",
  "/usr",
  "/bin",
  "/sbin",
  "/etc",
  "/private",
  "/Applications",
  "/opt",
  "/var",
  "/dev",
  "/Network",
  homedir,
  "C:\\",
  "C:\\Windows",
  "C:\\Program Files",
  "C:\\Program Files (x86)",
  "C:\\Users",
].map(normalize);

const WINDOWS_DRIVE_ROOT = /^[A-Za-z]:\\?$/;

const MACOS_VOLUME_ROOT = /^\/Volumes\/[^/]+\/?$/;

function normalize(p: string): string {
  return path.resolve(p).replace(/[\\/]+$/, "") || path.sep;
}

export function classifyPath(targetPath: string): ClassifyResult {
  const trimmed = targetPath.trim();
  if (WINDOWS_DRIVE_ROOT.test(trimmed)) {
    return block(`"${trimmed}" is an entire drive root.`);
  }

  const resolved = normalize(targetPath);

  if (CRITICAL_EXACT_PATHS.includes(resolved)) {
    return block(`"${resolved}" is a critical system path and can never be deleted or overwritten.`);
  }
  if (MACOS_VOLUME_ROOT.test(resolved)) {
    return block(`"${resolved}" is an entire mounted volume.`);
  }

  const userProtected = getUserProtectedPaths();
  for (const protectedPath of userProtected) {
    if (resolved === protectedPath || resolved.startsWith(protectedPath + path.sep)) {
      return block(`"${resolved}" is inside the user-protected path "${protectedPath}" (GUARDIAN_PROTECTED_PATHS).`);
    }
  }

  return allow();
}

export function getUserProtectedPaths(): string[] {
  const raw = process.env.GUARDIAN_PROTECTED_PATHS ?? "";
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map(normalize);
}

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { allow, block, confirm, worstOf, type ClassifyResult } from "./types.js";

type Flavor = "posix" | "win32";

const WINDOWS_DRIVE_ROOT = /^[A-Za-z]:\\?$/;
const MACOS_VOLUME_ROOT = /^\/Volumes\/[^/]+\/?$/;

const POSIX_DESCENDANT_BLOCKED = [
  "/System",
  "/Library",
  "/usr",
  "/bin",
  "/sbin",
  "/etc",
  "/Applications",
  "/opt",
  "/dev",
  "/Network",
];

const WIN32_DESCENDANT_BLOCKED = ["C:\\Windows", "C:\\Program Files", "C:\\Program Files (x86)", "C:\\ProgramData"];

const WIN32_EXACT_ONLY = ["C:\\Users"];

function detectFlavor(p: string): Flavor {
  if (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith("\\\\")) return "win32";
  if (p.startsWith("/")) return "posix";
  return process.platform === "win32" ? "win32" : "posix";
}

function moduleFor(flavor: Flavor): path.PlatformPath {
  return flavor === "win32" ? path.win32 : path.posix;
}

function isNativeFlavor(flavor: Flavor): boolean {
  return (flavor === "win32") === (process.platform === "win32");
}

function lexicalNormalize(p: string): { flavor: Flavor; resolved: string } {
  const flavor = detectFlavor(p);
  const mod = moduleFor(flavor);
  const abs = mod.isAbsolute(p) ? p : path.resolve(p);
  const normalized = mod.normalize(abs).replace(/[\\/]+$/, "") || mod.sep;
  return { flavor, resolved: normalized };
}

function isSelfOrDescendant(resolved: string, flavor: Flavor, ancestor: string): boolean {
  const mod = moduleFor(flavor);
  const normalizedAncestor = mod.normalize(ancestor).replace(/[\\/]+$/, "") || mod.sep;
  if (resolved === normalizedAncestor) return true;
  const withSep = normalizedAncestor.endsWith(mod.sep) ? normalizedAncestor : normalizedAncestor + mod.sep;
  return resolved.startsWith(withSep);
}

function checkAgainstCriticalAndProtected(resolved: string, flavor: Flavor): ClassifyResult {
  const homedir = lexicalNormalize(os.homedir()).resolved;
  if (flavor === lexicalNormalize(os.homedir()).flavor && resolved === homedir) {
    return block(`"${resolved}" is the user's entire home directory.`);
  }

  if (flavor === "posix") {
    if (resolved === "/") {
      return block(`"${resolved}" is the filesystem root.`);
    }
    for (const ancestor of POSIX_DESCENDANT_BLOCKED) {
      if (isSelfOrDescendant(resolved, flavor, ancestor)) {
        return block(`"${resolved}" is inside the critical system path "${ancestor}".`);
      }
    }
    if (MACOS_VOLUME_ROOT.test(resolved)) {
      return block(`"${resolved}" is an entire mounted volume.`);
    }
  } else {
    for (const ancestor of WIN32_DESCENDANT_BLOCKED) {
      if (isSelfOrDescendant(resolved, flavor, ancestor)) {
        return block(`"${resolved}" is inside the critical system path "${ancestor}".`);
      }
    }
    for (const ancestor of WIN32_EXACT_ONLY) {
      const normalizedAncestor = moduleFor(flavor).normalize(ancestor).replace(/[\\/]+$/, "");
      if (resolved === normalizedAncestor) {
        return block(`"${resolved}" is a critical system path.`);
      }
    }
  }

  for (const entry of getUserProtectedPathEntries()) {
    if (entry.flavor === flavor && isSelfOrDescendant(resolved, flavor, entry.resolved)) {
      return block(`"${resolved}" is inside the user-protected path "${entry.resolved}" (GUARDIAN_PROTECTED_PATHS).`);
    }
  }

  return allow();
}

function realishResolve(resolved: string, flavor: Flavor): { path: string; verdict?: ClassifyResult } {
  if (!isNativeFlavor(flavor)) return { path: resolved };

  const mod = moduleFor(flavor);
  let current = resolved;
  const missingSuffix: string[] = [];

  while (true) {
    try {
      const real = fs.realpathSync(current);
      const rejoined = missingSuffix.length ? mod.join(real, ...[...missingSuffix].reverse()) : real;
      return { path: rejoined };
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        const parent = mod.dirname(current);
        if (parent === current) {
          return { path: resolved };
        }
        missingSuffix.push(mod.basename(current));
        current = parent;
        continue;
      }
      return {
        path: resolved,
        verdict: confirm(
          `Could not verify the real (symlink-resolved) path of "${resolved}" (${code ?? "unknown error"}); proceeding with caution.`,
        ),
      };
    }
  }
}

export function classifyPath(targetPath: string): ClassifyResult {
  const trimmed = targetPath.trim();
  if (WINDOWS_DRIVE_ROOT.test(trimmed)) {
    return block(`"${trimmed}" is an entire drive root.`);
  }

  const { flavor, resolved } = lexicalNormalize(trimmed);
  const lexicalVerdict = checkAgainstCriticalAndProtected(resolved, flavor);

  const real = realishResolve(resolved, flavor);
  if (real.verdict) {
    return worstOf(lexicalVerdict, real.verdict);
  }
  if (real.path !== resolved) {
    const realVerdict = checkAgainstCriticalAndProtected(real.path, flavor);
    return worstOf(lexicalVerdict, realVerdict);
  }
  return lexicalVerdict;
}

function getUserProtectedPathEntries(): { flavor: Flavor; resolved: string }[] {
  const raw = process.env.GUARDIAN_PROTECTED_PATHS ?? "";
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => lexicalNormalize(p));
}

export function getUserProtectedPaths(): string[] {
  return getUserProtectedPathEntries().map((e) => e.resolved);
}

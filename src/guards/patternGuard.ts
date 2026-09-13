import { allow, block, type ClassifyResult } from "./types.js";

interface DangerPattern {
  pattern: RegExp;
  reason: string;
}

const DANGER_PATTERNS: DangerPattern[] = [
  { pattern: /\brm\b[^\n]*-[a-z]*r[a-z]*f|\brm\b[^\n]*-[a-z]*f[a-z]*r/i, reason: "recursive force delete (rm -rf/-fr)" },
  { pattern: /\bdd\b[^\n]*of=\/dev\//i, reason: "raw device overwrite (dd of=/dev/...)" },
  { pattern: /\bmkfs\.\w+/i, reason: "filesystem format (mkfs)" },
  { pattern: /\bdiskutil\s+(erasedisk|erasevolume)/i, reason: "disk erase (diskutil eraseDisk/eraseVolume)" },
  { pattern: /\bformat\s+[a-z]:/i, reason: "Windows drive format" },
  { pattern: /\bdrop\s+database\b/i, reason: "DROP DATABASE" },
  { pattern: /\bdrop\s+table\b/i, reason: "DROP TABLE" },
  { pattern: /\btruncate\s+table\b/i, reason: "TRUNCATE TABLE" },
  { pattern: /\bdelete\s+from\s+\S+\s*;?\s*$/i, reason: "DELETE FROM without a WHERE clause" },
  { pattern: />\s*\/dev\/sd[a-z]/i, reason: "raw device overwrite via redirect" },
  { pattern: /\brmdir\s+\/s/i, reason: "Windows recursive rmdir (/s)" },
  { pattern: /\bdel\s+\/[a-z]*[fq][a-z]*/i, reason: "Windows forced/quiet delete (del /f, /q)" },
  { pattern: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, reason: "fork bomb" },
];

export function classifyCommand(command: string): ClassifyResult {
  const reasons = DANGER_PATTERNS.filter((d) => d.pattern.test(command)).map((d) => d.reason);
  if (reasons.length > 0) {
    return block(`Command matches known-dangerous pattern(s): ${reasons.join(", ")}.`);
  }
  return allow();
}

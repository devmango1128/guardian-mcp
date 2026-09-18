import { allow, block, confirm, type ClassifyResult } from "./types.js";

type Tier = "block" | "confirm";

interface DangerPattern {
  test: (command: string) => boolean;
  reason: string;
  tier: Tier;
}

function matches(pattern: RegExp): (command: string) => boolean {
  return (command: string) => pattern.test(command);
}

function hasShortFlag(command: string, letter: string): boolean {
  const shortFlag = new RegExp(`(^|\\s)-[a-z]*${letter}[a-z]*(\\s|$)`, "i");
  return shortFlag.test(command);
}

function isRmWithRecursiveAndForce(command: string): boolean {
  if (!/\brm\b/i.test(command)) return false;
  const recursive = hasShortFlag(command, "r") || /--recursive\b/i.test(command);
  const force = hasShortFlag(command, "f") || /--force\b/i.test(command);
  return recursive && force;
}

const DANGER_PATTERNS: DangerPattern[] = [
  { test: isRmWithRecursiveAndForce, reason: "recursive force delete (rm -rf, or -r/-f given separately)", tier: "block" },
  { test: matches(/\bfind\b[^\n]*-delete\b/i), reason: "find -delete", tier: "block" },
  { test: matches(/\bxargs\b[^\n]*\brm\b/i), reason: "xargs rm", tier: "block" },
  { test: matches(/\brmtree\s*\(/i), reason: "Python shutil.rmtree(...)", tier: "block" },
  { test: matches(/\bos\.remove\s*\(/i), reason: "Python os.remove(...)", tier: "block" },
  { test: matches(/\bunlink\w*\s*\(/i), reason: "os.unlink(...) / fs.unlink(Sync)(...)", tier: "block" },
  { test: matches(/\b(rmSync|rmdirSync)\s*\(/i), reason: "Node fs.rmSync/rmdirSync", tier: "block" },
  { test: matches(/\bdd\b[^\n]*of=\/dev\//i), reason: "raw device overwrite (dd of=/dev/...)", tier: "block" },
  { test: matches(/\bmkfs\.\w+/i), reason: "filesystem format (mkfs)", tier: "block" },
  { test: matches(/\bdiskutil\s+(erasedisk|erasevolume)/i), reason: "disk erase (diskutil eraseDisk/eraseVolume)", tier: "block" },
  { test: matches(/\bformat\s+[a-z]:/i), reason: "Windows drive format", tier: "block" },
  { test: matches(/\bdrop\s+database\b/i), reason: "DROP DATABASE", tier: "block" },
  { test: matches(/\bdrop\s+table\b/i), reason: "DROP TABLE", tier: "block" },
  { test: matches(/\btruncate\s+table\b/i), reason: "TRUNCATE TABLE", tier: "block" },
  { test: matches(/\bdelete\s+from\s+\S+\s*;?\s*$/im), reason: "DELETE FROM without a WHERE clause", tier: "block" },
  { test: matches(/>\s*\/dev\/sd[a-z]/i), reason: "raw device overwrite via redirect", tier: "block" },
  { test: matches(/\brmdir\s+\/s/i), reason: "Windows recursive rmdir (/s)", tier: "block" },
  { test: matches(/\brd\s+\/s/i), reason: "Windows recursive rd (/s)", tier: "block" },
  { test: matches(/\bdel\s+\/[a-z]*[fq][a-z]*/i), reason: "Windows forced/quiet delete (del /f, /q)", tier: "block" },
  { test: matches(/\berase\s+\/[a-z]*[fq][a-z]*/i), reason: "Windows forced/quiet erase (erase /f, /q)", tier: "block" },
  { test: matches(/\bremove-item\b[^\n]*-(recurse|force)\b/i), reason: "PowerShell Remove-Item -Recurse/-Force", tier: "block" },
  { test: matches(/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/), reason: "fork bomb", tier: "block" },
  { test: matches(/\bgit\s+clean\b[^\n]*-[a-z]*f/i), reason: "git clean with -f (permanently deletes untracked files)", tier: "confirm" },
  { test: matches(/\bdocker\s+system\s+prune\b/i), reason: "docker system prune", tier: "confirm" },
  { test: matches(/\bkubectl\s+delete\b/i), reason: "kubectl delete", tier: "confirm" },
];

export function classifyCommand(command: string): ClassifyResult {
  const blocked = DANGER_PATTERNS.filter((d) => d.tier === "block" && d.test(command)).map((d) => d.reason);
  if (blocked.length > 0) {
    return block(`Command matches known-catastrophic pattern(s): ${blocked.join(", ")}.`);
  }

  const flagged = DANGER_PATTERNS.filter((d) => d.tier === "confirm" && d.test(command)).map((d) => d.reason);
  if (flagged.length > 0) {
    return confirm(
      `Command matches pattern(s) that are often safe but can be destructive: ${flagged.join(", ")}. ` +
        `Re-run with confirm:true if you're sure.`,
    );
  }

  return allow();
}

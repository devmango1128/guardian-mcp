import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const QUARANTINE_DIR = path.join(os.homedir(), ".guardian-mcp", "trash");

export function moveToQuarantine(targetPath: string): string {
  fs.mkdirSync(QUARANTINE_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dest = path.join(QUARANTINE_DIR, `${stamp}-${path.basename(targetPath)}`);
  try {
    fs.renameSync(targetPath, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EXDEV") {
      fs.cpSync(targetPath, dest, { recursive: true });
      fs.rmSync(targetPath, { recursive: true, force: true });
    } else {
      throw err;
    }
  }
  return dest;
}

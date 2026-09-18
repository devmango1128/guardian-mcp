import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { classifyBlastRadius, measureBlastRadius } from "../src/guards/blastRadius.js";

describe("classifyBlastRadius", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-blast-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.GUARDIAN_MAX_FILES;
    delete process.env.GUARDIAN_MAX_BYTES;
  });

  it("allows a missing path (nothing to lose)", () => {
    expect(classifyBlastRadius(path.join(tmpDir, "does-not-exist")).verdict).toBe("allow");
  });

  it("allows a directory just under the file-count threshold", () => {
    process.env.GUARDIAN_MAX_FILES = "5";
    for (let i = 0; i < 5; i++) {
      fs.writeFileSync(path.join(tmpDir, `f-${i}.txt`), "x");
    }
    expect(classifyBlastRadius(tmpDir).verdict).toBe("allow");
  });

  it("requires confirmation once the file-count threshold is exceeded", () => {
    process.env.GUARDIAN_MAX_FILES = "3";
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(path.join(tmpDir, `file-${i}.txt`), "x");
    }
    expect(classifyBlastRadius(tmpDir).verdict).toBe("confirm");
  });

  it("requires confirmation once the byte-size threshold is exceeded", () => {
    process.env.GUARDIAN_MAX_BYTES = "10";
    fs.writeFileSync(path.join(tmpDir, "big.txt"), "x".repeat(1000));
    expect(classifyBlastRadius(tmpDir).verdict).toBe("confirm");
  });

  it("escalates to confirm (not allow) when a subdirectory can't be read, even under the size threshold", () => {
    const restricted = path.join(tmpDir, "restricted");
    fs.mkdirSync(restricted);
    fs.writeFileSync(path.join(restricted, "secret.txt"), "x");
    fs.chmodSync(restricted, 0o000);

    try {
      if (process.platform === "win32" || process.getuid?.() === 0) {
        return;
      }
      const result = classifyBlastRadius(tmpDir);
      expect(result.verdict).toBe("confirm");
      expect(result.reasons.join(" ")).toMatch(/could not fully measure/i);
    } finally {
      fs.chmodSync(restricted, 0o755);
    }
  });

  it("includes the error reason in the message, not just a silent downgrade", () => {
    const restricted = path.join(tmpDir, "restricted2");
    fs.mkdirSync(restricted);
    fs.chmodSync(restricted, 0o000);

    try {
      if (process.platform === "win32" || process.getuid?.() === 0) return;
      const radius = measureBlastRadius(tmpDir, { maxFiles: 1000, maxBytes: 1_000_000_000 });
      expect(radius.errors.length).toBeGreaterThan(0);
      expect(radius.errors[0]).toContain(restricted);
    } finally {
      fs.chmodSync(restricted, 0o755);
    }
  });

  it("does not loop forever on a directory symlink (symlinks are counted, never traversed)", () => {
    const inner = path.join(tmpDir, "inner");
    fs.mkdirSync(inner);
    const loopLink = path.join(inner, "loop-back-to-parent");
    try {
      fs.symlinkSync(tmpDir, loopLink, "dir");
    } catch {
      return;
    }
    const radius = measureBlastRadius(tmpDir, { maxFiles: 1000, maxBytes: 1_000_000_000 });
    expect(radius.truncated).toBe(false);
    expect(radius.fileCount).toBeGreaterThanOrEqual(1);
  });
});

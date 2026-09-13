import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { classifyBlastRadius } from "../src/guards/blastRadius.js";

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

  it("allows a small directory under the default threshold", () => {
    fs.writeFileSync(path.join(tmpDir, "a.txt"), "hello");
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
});

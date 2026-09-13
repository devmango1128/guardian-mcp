import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { safeDelete } from "../src/tools/safeDelete.js";

describe("safeDelete (integration, isolated temp dir only)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-delete-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.GUARDIAN_PROTECTED_PATHS;
    delete process.env.GUARDIAN_MAX_FILES;
  });

  it("moves a normal file to quarantine instead of deleting it", () => {
    const file = path.join(tmpDir, "throwaway.txt");
    fs.writeFileSync(file, "bye");

    const result = safeDelete({ path: file });

    expect(result.ok).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
    const quarantineDir = path.join(os.homedir(), ".guardian-mcp", "trash");
    const recovered = fs.readdirSync(quarantineDir).find((f) => f.endsWith("throwaway.txt"));
    expect(recovered).toBeDefined();
    if (recovered) fs.rmSync(path.join(quarantineDir, recovered), { force: true });
  });

  it("refuses to delete a missing path", () => {
    const result = safeDelete({ path: path.join(tmpDir, "nope.txt") });
    expect(result.ok).toBe(false);
  });

  it("blocks deletion of a user-protected path even inside an otherwise-writable temp dir", () => {
    process.env.GUARDIAN_PROTECTED_PATHS = tmpDir;
    const file = path.join(tmpDir, "important.db");
    fs.writeFileSync(file, "data");

    const result = safeDelete({ path: file });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/BLOCKED/);
    expect(fs.existsSync(file)).toBe(true);
  });

  it("requires confirm:true once the blast radius threshold is exceeded", () => {
    process.env.GUARDIAN_MAX_FILES = "2";
    for (let i = 0; i < 10; i++) {
      fs.writeFileSync(path.join(tmpDir, `f-${i}.txt`), "x");
    }

    const first = safeDelete({ path: tmpDir });
    expect(first.ok).toBe(false);
    expect(first.message).toMatch(/CONFIRMATION REQUIRED/);
    expect(fs.existsSync(tmpDir)).toBe(true);

    const second = safeDelete({ path: tmpDir, confirm: true });
    expect(second.ok).toBe(true);
    expect(fs.existsSync(tmpDir)).toBe(false);
  });
});

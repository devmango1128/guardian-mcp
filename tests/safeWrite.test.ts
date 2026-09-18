import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { safeWrite } from "../src/tools/safeWrite.js";
import { listQuarantine } from "../src/tools/quarantine.js";

describe("safeWrite (integration, isolated temp dirs only)", () => {
  let tmpDir: string;
  let trashDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-write-"));
    trashDir = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-write-trash-"));
    process.env.GUARDIAN_TRASH_DIR = trashDir;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(trashDir, { recursive: true, force: true });
    delete process.env.GUARDIAN_TRASH_DIR;
    delete process.env.GUARDIAN_PROTECTED_PATHS;
  });

  it("writes a brand-new file", () => {
    const file = path.join(tmpDir, "new.txt");
    const result = safeWrite({ path: file, content: "hello" });
    expect(result.ok).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toBe("hello");
  });

  it("refuses to overwrite an existing file without overwrite:true", () => {
    const file = path.join(tmpDir, "existing.txt");
    fs.writeFileSync(file, "v1");
    const result = safeWrite({ path: file, content: "v2" });
    expect(result.ok).toBe(false);
    expect(fs.readFileSync(file, "utf8")).toBe("v1");
  });

  it("backs up the previous version to quarantine when overwriting", () => {
    const file = path.join(tmpDir, "existing.txt");
    fs.writeFileSync(file, "v1");
    const result = safeWrite({ path: file, content: "v2", overwrite: true });
    expect(result.ok).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toBe("v2");
    const backup = listQuarantine().find((r) => r.originalPath === file);
    expect(backup).toBeDefined();
    expect(fs.readFileSync(backup!.quarantinedPath, "utf8")).toBe("v1");
  });

  it("blocks writes to a user-protected path", () => {
    process.env.GUARDIAN_PROTECTED_PATHS = tmpDir;
    const file = path.join(tmpDir, "nope.txt");
    const result = safeWrite({ path: file, content: "data" });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/BLOCKED/);
    expect(fs.existsSync(file)).toBe(false);
  });

  it("restores the original file automatically if the write step fails after backing it up", () => {
    const file = path.join(tmpDir, "existing.txt");
    fs.writeFileSync(file, "original content");

    const originalWriteFileSync = fs.writeFileSync;
    const spy = vi.spyOn(fs, "writeFileSync").mockImplementation(((target: unknown, ...rest: unknown[]) => {
      if (typeof target === "string" && target.includes(".guardian-tmp-")) {
        throw new Error("simulated disk failure");
      }
      return (originalWriteFileSync as (...args: unknown[]) => unknown)(target, ...rest);
    }) as typeof fs.writeFileSync);

    const result = safeWrite({ path: file, content: "new content", overwrite: true });

    spy.mockRestore();

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/restored from backup/i);
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toBe("original content");
  });

  it("does not leave a stray temp file behind after a failed write", () => {
    const file = path.join(tmpDir, "fresh.txt");

    const originalWriteFileSync = fs.writeFileSync;
    const spy = vi.spyOn(fs, "writeFileSync").mockImplementation(((target: unknown, ...rest: unknown[]) => {
      if (typeof target === "string" && target.includes(".guardian-tmp-")) {
        throw new Error("simulated disk failure");
      }
      return (originalWriteFileSync as (...args: unknown[]) => unknown)(target, ...rest);
    }) as typeof fs.writeFileSync);

    const result = safeWrite({ path: file, content: "data" });
    spy.mockRestore();

    expect(result.ok).toBe(false);
    const leftovers = fs.readdirSync(tmpDir).filter((f) => f.includes(".guardian-tmp-"));
    expect(leftovers).toEqual([]);
  });
});

import { describe, expect, it, afterEach } from "vitest";
import os from "node:os";
import path from "node:path";
import { classifyPath } from "../src/guards/pathGuard.js";

describe("classifyPath", () => {
  afterEach(() => {
    delete process.env.GUARDIAN_PROTECTED_PATHS;
  });

  it("blocks the filesystem root", () => {
    expect(classifyPath("/").verdict).toBe("block");
  });

  it("blocks core OS directories", () => {
    for (const p of ["/System", "/Library", "/usr", "/etc", "/bin"]) {
      expect(classifyPath(p).verdict, p).toBe("block");
    }
  });

  it("blocks Windows drive roots regardless of drive letter", () => {
    expect(classifyPath("D:\\").verdict).toBe("block");
    expect(classifyPath("E:").verdict).toBe("block");
  });

  it("blocks an entire mounted macOS volume", () => {
    expect(classifyPath("/Volumes/BackupDrive").verdict).toBe("block");
  });

  it("blocks the user's entire home directory", () => {
    expect(classifyPath(os.homedir()).verdict).toBe("block");
  });

  it("allows an ordinary project subfolder", () => {
    expect(classifyPath(path.join(os.homedir(), "Dev", "some-project")).verdict).toBe("allow");
  });

  it("blocks a path traversal attempt that resolves into a critical directory", () => {
    expect(classifyPath("/Users/someone/../../etc").verdict).toBe("block");
  });

  it("blocks paths inside a user-configured protected folder", () => {
    const protectedDir = path.join(os.homedir(), "important-project");
    process.env.GUARDIAN_PROTECTED_PATHS = protectedDir;
    expect(classifyPath(protectedDir).verdict).toBe("block");
    expect(classifyPath(path.join(protectedDir, "nested", "file.txt")).verdict).toBe("block");
  });

  it("does not block a sibling folder that merely shares a prefix with a protected folder", () => {
    process.env.GUARDIAN_PROTECTED_PATHS = path.join(os.homedir(), "project");
    expect(classifyPath(path.join(os.homedir(), "project-backup")).verdict).toBe("allow");
  });
});

import { describe, expect, it, afterEach, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { classifyPath } from "../src/guards/pathGuard.js";

describe("classifyPath — POSIX critical paths", () => {
  afterEach(() => {
    delete process.env.GUARDIAN_PROTECTED_PATHS;
  });

  it("blocks the filesystem root", () => {
    expect(classifyPath("/").verdict).toBe("block");
  });

  it("blocks core OS directories exactly", () => {
    for (const p of ["/System", "/Library", "/usr", "/etc", "/bin"]) {
      expect(classifyPath(p).verdict, p).toBe("block");
    }
  });

  it("blocks descendants of core OS directories", () => {
    expect(classifyPath("/etc/passwd").verdict).toBe("block");
    expect(classifyPath("/usr/bin/node").verdict).toBe("block");
    expect(classifyPath("/System/Library/CoreServices").verdict).toBe("block");
  });

  it("does not confuse a critical path with a sibling that shares its prefix", () => {
    expect(classifyPath("/etc2/config").verdict).toBe("allow");
    expect(classifyPath("/etc-backup").verdict).toBe("allow");
    expect(classifyPath("/usr-local/bin").verdict).toBe("allow");
  });

  it("blocks a path traversal attempt that resolves into a critical directory", () => {
    expect(classifyPath("/Users/someone/../../etc/passwd").verdict).toBe("block");
  });

  it("allows normal, non-critical temp and project paths (regression: /var and /private must not be over-blocked)", () => {
    expect(classifyPath(os.tmpdir()).verdict).toBe("allow");
    expect(classifyPath(path.join(os.tmpdir(), "some-build-artifact")).verdict).toBe("allow");
    expect(classifyPath("/var/log/whatever").verdict).toBe("allow");
  });

  it("blocks an entire mounted macOS volume but not its contents", () => {
    expect(classifyPath("/Volumes/BackupDrive").verdict).toBe("block");
    expect(classifyPath("/Volumes/BackupDrive/some-folder").verdict).toBe("allow");
  });

  it("blocks the user's entire home directory but allows ordinary subfolders", () => {
    expect(classifyPath(os.homedir()).verdict).toBe("block");
    expect(classifyPath(path.join(os.homedir(), "Dev", "some-project")).verdict).toBe("allow");
  });
});

describe("classifyPath — Windows critical paths (pure string logic, runs on any host)", () => {
  it("blocks drive roots regardless of drive letter", () => {
    expect(classifyPath("D:\\").verdict).toBe("block");
    expect(classifyPath("E:").verdict).toBe("block");
  });

  it("blocks Windows system directories and their descendants", () => {
    expect(classifyPath("C:\\Windows").verdict).toBe("block");
    expect(classifyPath("C:\\Windows\\System32").verdict).toBe("block");
    expect(classifyPath("C:\\Program Files\\SomeApp").verdict).toBe("block");
  });

  it("does not confuse a lookalike directory name with the real one", () => {
    expect(classifyPath("C:\\WindowsFake").verdict).toBe("allow");
    expect(classifyPath("C:\\Program Files (x86) Not Really").verdict).toBe("allow");
  });

  it("blocks C:\\Users exactly but allows a specific user's project folder", () => {
    expect(classifyPath("C:\\Users").verdict).toBe("block");
    expect(classifyPath("C:\\Users\\me\\project").verdict).toBe("allow");
  });

  it("normalizes .. traversal on Windows-style paths", () => {
    expect(classifyPath("C:\\Users\\me\\..\\..\\Windows\\System32").verdict).toBe("block");
  });
});

describe("classifyPath — user-configured protected paths", () => {
  afterEach(() => {
    delete process.env.GUARDIAN_PROTECTED_PATHS;
  });

  it("blocks the protected path itself and nested files under it", () => {
    const protectedDir = path.join(os.homedir(), "important-project");
    process.env.GUARDIAN_PROTECTED_PATHS = protectedDir;
    expect(classifyPath(protectedDir).verdict).toBe("block");
    expect(classifyPath(path.join(protectedDir, "nested", "file.txt")).verdict).toBe("block");
  });

  it("blocks a non-existing file path under a protected parent", () => {
    const protectedDir = path.join(os.homedir(), "important-project");
    process.env.GUARDIAN_PROTECTED_PATHS = protectedDir;
    expect(classifyPath(path.join(protectedDir, "does", "not", "exist.txt")).verdict).toBe("block");
  });

  it("does not block a sibling folder that merely shares a prefix with a protected folder", () => {
    process.env.GUARDIAN_PROTECTED_PATHS = path.join(os.homedir(), "project");
    expect(classifyPath(path.join(os.homedir(), "project-backup")).verdict).toBe("allow");
  });

  it("supports multiple comma-separated protected paths", () => {
    const a = path.join(os.homedir(), "project-a");
    const b = path.join(os.homedir(), "project-b");
    process.env.GUARDIAN_PROTECTED_PATHS = `${a},${b}`;
    expect(classifyPath(a).verdict).toBe("block");
    expect(classifyPath(b).verdict).toBe("block");
    expect(classifyPath(path.join(os.homedir(), "project-c")).verdict).toBe("allow");
  });
});

function canCreateSymlinks(): boolean {
  const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-symlink-probe-"));
  try {
    fs.symlinkSync(probeDir, path.join(probeDir, "..", `probe-link-${process.pid}`), "dir");
    fs.rmSync(path.join(probeDir, "..", `probe-link-${process.pid}`), { force: true });
    return true;
  } catch {
    return false;
  } finally {
    fs.rmSync(probeDir, { recursive: true, force: true });
  }
}

const SYMLINKS_SUPPORTED = canCreateSymlinks();

describe.skipIf(!SYMLINKS_SUPPORTED)("classifyPath — symlink and realpath handling (real filesystem, isolated temp dir)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "guardian-symlink-")));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.GUARDIAN_PROTECTED_PATHS;
  });

  it("blocks a symlink that points into a protected directory", () => {
    const protectedDir = path.join(tmpDir, "protected");
    fs.mkdirSync(protectedDir);
    process.env.GUARDIAN_PROTECTED_PATHS = protectedDir;

    const link = path.join(tmpDir, "innocuous-looking-link");
    fs.symlinkSync(protectedDir, link, "dir");

    expect(classifyPath(link).verdict).toBe("block");
  });

  it("blocks a symlink whose target file lives inside a protected directory", () => {
    const protectedDir = path.join(tmpDir, "protected");
    fs.mkdirSync(protectedDir);
    const targetFile = path.join(protectedDir, "secret.txt");
    fs.writeFileSync(targetFile, "data");
    process.env.GUARDIAN_PROTECTED_PATHS = protectedDir;

    const link = path.join(tmpDir, "link-to-secret");
    fs.symlinkSync(targetFile, link, "file");

    expect(classifyPath(link).verdict).toBe("block");
  });

  it("allows a symlink that points to an ordinary, unprotected location", () => {
    const realDir = path.join(tmpDir, "ordinary");
    fs.mkdirSync(realDir);
    const link = path.join(tmpDir, "link-to-ordinary");
    fs.symlinkSync(realDir, link, "dir");

    expect(classifyPath(link).verdict).toBe("allow");
  });

  it("handles a dangling symlink without throwing and without silently allowing critical targets", () => {
    const link = path.join(tmpDir, "dangling-link");
    fs.symlinkSync(path.join(tmpDir, "does-not-exist-target"), link, "file");

    expect(() => classifyPath(link)).not.toThrow();
    expect(classifyPath(link).verdict).toBe("allow");
  });
});

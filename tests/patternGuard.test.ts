import { describe, expect, it } from "vitest";
import { classifyCommand } from "../src/guards/patternGuard.js";

const DANGEROUS_COMMANDS = [
  "rm -rf /",
  "rm -rf ~",
  "rm -fr node_modules",
  "sudo rm -rf --no-preserve-root /",
  "dd if=/dev/zero of=/dev/sda",
  "mkfs.ext4 /dev/sda1",
  "diskutil eraseDisk JHFS+ Untitled disk2",
  "format C: /q",
  "DROP DATABASE production;",
  "drop table users;",
  "TRUNCATE TABLE orders;",
  "DELETE FROM users;",
  "rmdir /s /q C:\\Users\\me\\project",
  "del /f /q C:\\Users\\me\\project",
  ":(){ :|:& };:",
];

const SAFE_COMMANDS = [
  "ls -la",
  "echo hello",
  "git status",
  "rm ./tmp/file.txt",
  "DELETE FROM users WHERE id = 42;",
  "npm install",
  "mkdir new-folder",
];

describe("classifyCommand", () => {
  it.each(DANGEROUS_COMMANDS)("blocks: %s", (cmd) => {
    expect(classifyCommand(cmd).verdict).toBe("block");
  });

  it.each(SAFE_COMMANDS)("allows: %s", (cmd) => {
    expect(classifyCommand(cmd).verdict).toBe("allow");
  });
});

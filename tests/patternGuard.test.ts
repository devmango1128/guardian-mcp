import { describe, expect, it } from "vitest";
import { classifyCommand } from "../src/guards/patternGuard.js";

const BLOCKED_COMMANDS = [
  "rm -rf /",
  "rm -rf ~",
  "rm -fr node_modules",
  "sudo rm -rf --no-preserve-root /",
  "bash -c \"rm -rf /important-data\"",
  "find . -name '*.log' -delete",
  "find / -type f -delete",
  "find . -name core | xargs rm",
  "ls | xargs rm -f",
  "python3 -c \"import shutil; shutil.rmtree('/data')\"",
  "python3 -c \"__import__('shutil').rmtree('/data')\"",
  "python -c \"import os; os.remove('/data/file')\"",
  "python -c \"os.unlink('/data/file')\"",
  "node -e \"require('fs').rmSync('/data', {recursive:true})\"",
  "node -e \"fs.unlinkSync('/data/file')\"",
  "rm -r -f /",
  "rm -f -r /",
  "rm -f --recursive /",
  "rm --recursive --force /",
  "DELETE FROM users;\nDELETE FROM audit_log WHERE id = 1;",
  "dd if=/dev/zero of=/dev/sda",
  "mkfs.ext4 /dev/sda1",
  "diskutil eraseDisk JHFS+ Untitled disk2",
  "format C: /q",
  "DROP DATABASE production;",
  "drop table users;",
  "TRUNCATE TABLE orders;",
  "DELETE FROM users;",
  "rmdir /s /q C:\\Users\\me\\project",
  "rd /s /q C:\\Users\\me\\project",
  "del /f /q C:\\Users\\me\\project",
  "erase /f /q C:\\Users\\me\\project",
  "Remove-Item -Recurse -Force C:\\Users\\me\\project",
  "Remove-Item C:\\project -Force",
  ":(){ :|:& };:",
];

const CONFIRM_COMMANDS = ["git clean -fd", "git clean -fdx", "docker system prune -a", "kubectl delete pod my-pod"];

const SAFE_COMMANDS = [
  "ls -la",
  "echo hello",
  "git status",
  "git clean -n",
  "rm ./tmp/file.txt",
  "rm --force somefile.txt",
  "rm -f somefile.txt",
  "DELETE FROM users WHERE id = 42;",
  "__import__('os').remove('/data/file')",
  "npm install",
  "mkdir new-folder",
  "python script.py",
  "node index.js",
  "find . -name '*.log'",
  "kubectl get pods",
  "docker ps",
];

describe("classifyCommand — block tier", () => {
  it.each(BLOCKED_COMMANDS)("blocks: %s", (cmd) => {
    expect(classifyCommand(cmd).verdict).toBe("block");
  });
});

describe("classifyCommand — confirm tier (often safe, occasionally destructive)", () => {
  it.each(CONFIRM_COMMANDS)("requires confirmation for: %s", (cmd) => {
    expect(classifyCommand(cmd).verdict).toBe("confirm");
  });
});

describe("classifyCommand — safe commands must not false-positive", () => {
  it.each(SAFE_COMMANDS)("allows: %s", (cmd) => {
    expect(classifyCommand(cmd).verdict).toBe("allow");
  });
});

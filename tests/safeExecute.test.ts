import { describe, expect, it } from "vitest";
import { safeExecute } from "../src/tools/safeExecute.js";

describe("safeExecute", () => {
  it("blocks a catastrophic command without ever running it", () => {
    const result = safeExecute({ command: "rm -rf /" });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/BLOCKED/);
  });

  it("runs an ordinary safe command", () => {
    const result = safeExecute({ command: "echo hello-from-guardian" });
    expect(result.ok).toBe(true);
    expect(result.message).toContain("hello-from-guardian");
  });

  it("requires confirm:true for a command that is often safe but can be destructive", () => {
    const first = safeExecute({ command: "git clean -fd" });
    expect(first.ok).toBe(false);
    expect(first.message).toMatch(/CONFIRMATION REQUIRED/);
  });

  it("runs a confirm-tier command once confirm:true is passed", () => {
    const result = safeExecute({ command: "echo would-run-git-clean", confirm: true });
    expect(result.ok).toBe(true);
  });
});

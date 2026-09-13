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
});

import type { ClassifyResult } from "./types.js";
import { worstOf } from "./types.js";
import { classifyPath } from "./pathGuard.js";
import { classifyBlastRadius } from "./blastRadius.js";
import { classifyCommand } from "./patternGuard.js";

export function classifyDelete(targetPath: string): ClassifyResult {
  return worstOf(classifyPath(targetPath), classifyBlastRadius(targetPath));
}

export function classifyWrite(targetPath: string): ClassifyResult {
  return classifyPath(targetPath);
}

export function classifyExecute(command: string): ClassifyResult {
  return classifyCommand(command);
}

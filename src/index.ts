#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { safeDelete } from "./tools/safeDelete.js";
import { safeWrite } from "./tools/safeWrite.js";
import { safeExecute } from "./tools/safeExecute.js";
import { listQuarantine, restoreFromQuarantine, purgeQuarantine } from "./tools/quarantine.js";

const server = new McpServer({ name: "guardian-mcp", version: "0.2.0" });

server.tool(
  "safe_delete",
  "Delete a file or directory, but only after checking it against known-critical system paths, " +
    "user-protected paths, and blast-radius limits. This does not sandbox or intercept your other " +
    "tools — it only guards operations that go through this one. Deletes are recoverable: the " +
    "target is moved to a quarantine folder (~/.guardian-mcp/trash) instead of being unlinked. " +
    "If the target is large or couldn't be fully measured, call again with confirm:true after " +
    "reviewing the warning.",
  { path: z.string().describe("Absolute path to delete"), confirm: z.boolean().optional() },
  async ({ path, confirm }) => {
    const result = safeDelete({ path, confirm });
    return { content: [{ type: "text", text: result.message }], isError: !result.ok };
  },
);

server.tool(
  "safe_write",
  "Write content to a file, refusing known-critical or user-protected paths. If the file already " +
    "exists, requires overwrite:true and automatically backs up the previous version to the " +
    "quarantine folder first; if the write itself then fails, the backup is restored automatically.",
  {
    path: z.string().describe("Absolute path to write"),
    content: z.string(),
    overwrite: z.boolean().optional(),
  },
  async ({ path, content, overwrite }) => {
    const result = safeWrite({ path, content, overwrite });
    return { content: [{ type: "text", text: result.message }], isError: !result.ok };
  },
);

server.tool(
  "safe_execute",
  "Run a shell command after screening it against a pattern-based blocklist of known-catastrophic " +
    "signatures (rm -rf, DROP DATABASE, disk format, fork bombs, etc.) and a confirm-required list of " +
    "commands that are often safe but occasionally destructive (git clean, docker system prune, " +
    "kubectl delete). This is a heuristic safety net, not a sandbox: it cannot see inside script files " +
    "it merely invokes, and a deliberately obfuscated command can bypass it.",
  { command: z.string(), confirm: z.boolean().optional() },
  async ({ command, confirm }) => {
    const result = safeExecute({ command, confirm });
    return { content: [{ type: "text", text: result.message }], isError: !result.ok };
  },
);

server.tool(
  "list_trash",
  "List everything currently sitting in the guardian-mcp quarantine folder (from safe_delete or " +
    "safe_write backups), with original path, timestamp, and the id needed to restore or purge it.",
  {},
  async () => {
    const records = listQuarantine();
    const text = records.length === 0 ? "Quarantine is empty." : JSON.stringify(records, null, 2);
    return { content: [{ type: "text", text }] };
  },
);

server.tool(
  "restore_trash",
  "Restore a quarantined file or directory back to its original path, given the id from list_trash. " +
    "Refuses if something already exists at the original path.",
  { id: z.string() },
  async ({ id }) => {
    const result = restoreFromQuarantine(id);
    return { content: [{ type: "text", text: result.message }], isError: !result.ok };
  },
);

server.tool(
  "purge_trash",
  "Permanently delete items from the quarantine folder, freeing disk space. Nothing is purged " +
    "automatically or by default — you must pass ids and/or olderThanDays explicitly. Use dryRun:true " +
    "first to preview. Purging more than 20 items at once requires confirm:true.",
  {
    ids: z.array(z.string()).optional(),
    olderThanDays: z.number().optional(),
    dryRun: z.boolean().optional(),
    confirm: z.boolean().optional(),
  },
  async ({ ids, olderThanDays, dryRun, confirm }) => {
    const result = purgeQuarantine({ ids, olderThanDays, dryRun, confirm });
    return { content: [{ type: "text", text: result.message }], isError: !result.ok };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("guardian-mcp fatal error:", err);
  process.exit(1);
});

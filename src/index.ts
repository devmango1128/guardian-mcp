#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { safeDelete } from "./tools/safeDelete.js";
import { safeWrite } from "./tools/safeWrite.js";
import { safeExecute } from "./tools/safeExecute.js";

const server = new McpServer({ name: "guardian-mcp", version: "0.1.0" });

server.tool(
  "safe_delete",
  "Delete a file or directory, but only after checking it against system-critical paths, " +
    "user-protected paths, and blast-radius limits. Deletes are recoverable: the target is " +
    "moved to a quarantine folder (~/.guardian-mcp/trash) instead of being unlinked. If the " +
    "target is large, call again with confirm:true after reviewing the size warning.",
  { path: z.string().describe("Absolute path to delete"), confirm: z.boolean().optional() },
  async ({ path, confirm }) => {
    const result = safeDelete({ path, confirm });
    return { content: [{ type: "text", text: result.message }], isError: !result.ok };
  },
);

server.tool(
  "safe_write",
  "Write content to a file, refusing system-critical or user-protected paths. If the file " +
    "already exists, requires overwrite:true and automatically backs up the previous version " +
    "to the quarantine folder first.",
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
  "Run a shell command after screening it for known-catastrophic patterns " +
    "(rm -rf, DROP DATABASE, disk format, fork bombs, etc.), regardless of what path or " +
    "table it targets. This is a pattern-based safety net, not a sandbox.",
  { command: z.string() },
  async ({ command }) => {
    const result = safeExecute({ command });
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

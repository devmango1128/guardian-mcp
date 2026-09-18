# Threat Model

Guardian MCP provides a recoverable safety layer designed to reduce common catastrophic mistakes made by AI coding agents. It is not a sandbox, and it does not assume an adversarial local user.

## Protects against

- Accidental recursive deletion of large or system-critical directory trees (`safe_delete` + `pathGuard` + `blastRadius`)
- Accidental overwrite of an existing file, with automatic backup and rollback on write failure (`safe_write`)
- Destructive shell/SQL commands that match known-catastrophic signatures, regardless of which path or table they target (`rm -rf`, `DROP DATABASE`, `mkfs`, PowerShell `Remove-Item -Recurse -Force`, fork bombs, etc.)
- Commands that are often safe but occasionally destructive (`git clean -fd`, `docker system prune`, `kubectl delete`), by requiring explicit confirmation
- Symlink-based path traversal into a protected or critical directory (the real, `realpath`-resolved target is checked, not just the lexical path string)
- Accidental modification of a small, explicit list of user-designated protected paths (`GUARDIAN_PROTECTED_PATHS`)
- Silent data loss from an unmeasurable delete target (permission errors during the blast-radius scan escalate to a required confirmation instead of being ignored)

## Does NOT protect against

- **A malicious local user or malicious code already running with the same OS privileges as the agent.** Guardian MCP is a cooperative guard inside one MCP server process, not an OS-level access control mechanism.
- **Intentionally obfuscated commands designed to bypass pattern detection** — e.g. base64-encoded payloads, dynamically constructed strings, or destructive calls hidden inside a script *file* that `safe_execute` merely invokes (`python script.py`). The pattern guard can only reason about text that is directly visible in the command string; it cannot see inside files it doesn't read.
- **Destructive actions taken through tools other than this server's own `safe_*` tools.** If the client still exposes an unrestricted Bash tool (or similar), an agent can bypass Guardian MCP entirely by using that tool instead. See the README's "왜 클라이언트 설정이 꼭 필요한가" section — pairing this server with client-side deny rules is required for meaningful protection.
- **Kernel or root-level compromise.** If the process (or something with equivalent privilege) is already compromised, no userspace guard can be trusted to hold.
- **TOCTOU (time-of-check-to-time-of-use) races.** Real-path resolution happens once, synchronously, before the guarded operation; a sufficiently fast concurrent change to the filesystem between check and use (e.g. swapping a symlink target) is not fully closed off. This reduces the attack surface but does not eliminate it.
- **Arbitrary scripts deliberately designed and tested to bypass this specific tool's detection logic.** The pattern list is a heuristic blocklist, not a formal verifier; it will always be possible to construct a command that isn't on it.
- **Full concurrent-process safety on the quarantine index.** `~/.guardian-mcp/trash/index.json` is read-modify-written per operation without file locking; concurrent Guardian MCP processes writing to the same trash directory at the same instant could race. Single-agent, single-process use (the common case) is unaffected.
- **Atomicity between a quarantine move and its metadata write.** Moving a file into `~/.guardian-mcp/trash` and recording it in `index.json` are two separate filesystem operations, not one transaction. A crash in between could leave an orphaned file in the trash folder with no index entry (recoverable by hand, but not through `list_trash`/`restore_trash`), or, more rarely, a restore whose physical move succeeded just before a crash prevented the index update.
- **Indirect calls to generic-sounding destructive functions.** `shutil.rmtree(...)` and `unlink(...)`/`unlinkSync(...)` are detected under any alias (e.g. `__import__('shutil').rmtree(...)`), because those names are distinctive enough to flag safely. `os.remove(...)` is only detected when written that way (or similarly qualified) — a bare `remove(...)` is not flagged, because "remove" is common enough as a method name (array/list `.remove()`, etc.) that blocking it outright would false-positive on everyday code. This is a deliberate gap, not an oversight.

## Design principle

Where the classification is ambiguous, Guardian MCP fails toward caution without blocking ordinary development work outright:

- **Clearly dangerous → BLOCK** (no override; the operation simply doesn't happen)
- **Possibly dangerous or unmeasurable → CONFIRM** (requires an explicit `confirm:true` retry)
- **Clearly safe → ALLOW**

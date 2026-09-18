import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listQuarantine, moveToQuarantine, purgeQuarantine, restoreFromQuarantine } from "../src/tools/quarantine.js";

describe("quarantine subsystem (isolated trash dir via GUARDIAN_TRASH_DIR)", () => {
  let workDir: string;
  let trashDir: string;

  beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-work-"));
    trashDir = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-trash-"));
    process.env.GUARDIAN_TRASH_DIR = trashDir;
  });

  afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
    fs.rmSync(trashDir, { recursive: true, force: true });
    delete process.env.GUARDIAN_TRASH_DIR;
  });

  it("moves a file into quarantine and lists it", () => {
    const file = path.join(workDir, "a.txt");
    fs.writeFileSync(file, "hello");

    const record = moveToQuarantine(file, "delete");

    expect(fs.existsSync(file)).toBe(false);
    expect(fs.existsSync(record.quarantinedPath)).toBe(true);
    expect(listQuarantine().map((r) => r.id)).toContain(record.id);
  });

  it("restores a quarantined file back to its original path", () => {
    const file = path.join(workDir, "b.txt");
    fs.writeFileSync(file, "hello");
    const record = moveToQuarantine(file, "delete");

    const result = restoreFromQuarantine(record.id);

    expect(result.ok).toBe(true);
    expect(fs.existsSync(file)).toBe(true);
    expect(fs.readFileSync(file, "utf8")).toBe("hello");
    expect(listQuarantine().map((r) => r.id)).not.toContain(record.id);
  });

  it("refuses to restore over an existing file at the original path", () => {
    const file = path.join(workDir, "c.txt");
    fs.writeFileSync(file, "original");
    const record = moveToQuarantine(file, "delete");
    fs.writeFileSync(file, "someone else wrote here since");

    const result = restoreFromQuarantine(record.id);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/already exists/i);
    expect(fs.readFileSync(file, "utf8")).toBe("someone else wrote here since");
  });

  it("drops a stale record and reports it when the quarantined item is missing from disk", () => {
    const file = path.join(workDir, "gone.txt");
    fs.writeFileSync(file, "hi");
    const record = moveToQuarantine(file, "delete");
    fs.rmSync(record.quarantinedPath, { force: true });

    const result = restoreFromQuarantine(record.id);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/missing on disk/i);
    expect(listQuarantine().map((r) => r.id)).not.toContain(record.id);
  });

  it("returns a clear error for an unknown quarantine id", () => {
    const result = restoreFromQuarantine("00000000-0000-0000-0000-000000000000");
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/no quarantine record/i);
  });

  it("never collides even when two files share the same basename", () => {
    const dirA = path.join(workDir, "a");
    const dirB = path.join(workDir, "b");
    fs.mkdirSync(dirA);
    fs.mkdirSync(dirB);
    fs.writeFileSync(path.join(dirA, "same-name.txt"), "from a");
    fs.writeFileSync(path.join(dirB, "same-name.txt"), "from b");

    const r1 = moveToQuarantine(path.join(dirA, "same-name.txt"), "delete");
    const r2 = moveToQuarantine(path.join(dirB, "same-name.txt"), "delete");

    expect(r1.quarantinedPath).not.toBe(r2.quarantinedPath);
    expect(fs.readFileSync(r1.quarantinedPath, "utf8")).toBe("from a");
    expect(fs.readFileSync(r2.quarantinedPath, "utf8")).toBe("from b");
  });

  it("treats a corrupted index.json as empty instead of crashing, and preserves the corrupt file", () => {
    fs.mkdirSync(trashDir, { recursive: true });
    fs.writeFileSync(path.join(trashDir, "index.json"), "{ not valid json ][");

    expect(() => listQuarantine()).not.toThrow();
    expect(listQuarantine()).toEqual([]);

    const file = path.join(workDir, "d.txt");
    fs.writeFileSync(file, "hi");
    moveToQuarantine(file, "delete");
    expect(listQuarantine().length).toBe(1);
  });

  it("purge refuses to run with no criteria at all", () => {
    const result = purgeQuarantine({});
    expect(result.ok).toBe(false);
    expect(result.purged).toEqual([]);
  });

  it("purge dryRun previews without deleting anything", () => {
    const file = path.join(workDir, "e.txt");
    fs.writeFileSync(file, "hi");
    const record = moveToQuarantine(file, "delete");

    const result = purgeQuarantine({ ids: [record.id], dryRun: true });

    expect(result.ok).toBe(true);
    expect(result.purged.map((r) => r.id)).toContain(record.id);
    expect(fs.existsSync(record.quarantinedPath)).toBe(true);
    expect(listQuarantine().map((r) => r.id)).toContain(record.id);
  });

  it("purge by id actually deletes the quarantined item and its record", () => {
    const file = path.join(workDir, "f.txt");
    fs.writeFileSync(file, "hi");
    const record = moveToQuarantine(file, "delete");

    const result = purgeQuarantine({ ids: [record.id] });

    expect(result.ok).toBe(true);
    expect(fs.existsSync(record.quarantinedPath)).toBe(false);
    expect(listQuarantine().map((r) => r.id)).not.toContain(record.id);
  });

  it("purge by olderThanDays keeps recent items and removes old ones", () => {
    const oldFile = path.join(workDir, "old.txt");
    const newFile = path.join(workDir, "new.txt");
    fs.writeFileSync(oldFile, "old");
    fs.writeFileSync(newFile, "new");

    const oldRecord = moveToQuarantine(oldFile, "delete");
    const newRecord = moveToQuarantine(newFile, "delete");

    const records = listQuarantine();
    const oldIdx = records.findIndex((r) => r.id === oldRecord.id);
    records[oldIdx] = { ...records[oldIdx], timestamp: new Date(Date.now() - 30 * 86_400_000).toISOString() };
    fs.writeFileSync(path.join(trashDir, "index.json"), JSON.stringify(records, null, 2));

    const result = purgeQuarantine({ olderThanDays: 7 });

    expect(result.ok).toBe(true);
    expect(result.purged.map((r) => r.id)).toEqual([oldRecord.id]);
    const remainingIds = listQuarantine().map((r) => r.id);
    expect(remainingIds).toContain(newRecord.id);
    expect(remainingIds).not.toContain(oldRecord.id);
  });

  it("requires confirm:true before purging more than the safety threshold at once", () => {
    for (let i = 0; i < 25; i++) {
      const file = path.join(workDir, `bulk-${i}.txt`);
      fs.writeFileSync(file, "x");
      moveToQuarantine(file, "delete");
    }

    const allIds = listQuarantine().map((r) => r.id);
    const first = purgeQuarantine({ ids: allIds });
    expect(first.ok).toBe(false);
    expect(first.message).toMatch(/CONFIRMATION REQUIRED/);
    expect(listQuarantine().length).toBe(25);

    const second = purgeQuarantine({ ids: allIds, confirm: true });
    expect(second.ok).toBe(true);
    expect(listQuarantine().length).toBe(0);
  });
});

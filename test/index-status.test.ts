import { test } from "node:test";
import assert from "node:assert/strict";
import { indexStatusText } from "../src/index-status";
test("cached validation and actual parsing have distinct status text", () => {
  const base = {
    indexing: true,
    files: 100,
    applications: 2,
    restoredFiles: 100,
    parsedFiles: 0,
  };
  assert.match(
    indexStatusText({ ...base, phase: "loading cache" }).label,
    /loading cache/,
  );
  const cached = indexStatusText({ ...base, phase: "checking files" });
  assert.match(cached.label, /checking files/);
  assert.match(cached.detail, /100 cached files restored; 0 parse jobs/);
  assert.match(
    indexStatusText({ ...base, phase: "parsing changes", parsedFiles: 3 })
      .label,
    /parsing changes/,
  );
  assert.match(indexStatusText({ ...base, indexing: false }).label, /ready/);
});

test("partial indexes remain visibly incomplete", () => {
  const status = indexStatusText({
    indexing: false,
    files: 12,
    applications: 1,
    failed: true,
    failures: 2,
  });
  assert.match(status.label, /warning.*incomplete index/);
  assert.match(status.detail, /2 read failures/);
});

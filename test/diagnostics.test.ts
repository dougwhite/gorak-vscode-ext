import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnosticSummary } from "../src/diagnostics";
test("diagnostic summaries exclude source, paths and request payloads", async () => {
  const summary = await diagnosticSummary(
    { extensionVersion: "0.9.1" },
    async () => ({
      files: 17,
      serverVersion: "0.9.0-alpha.2",
      source: "private source",
      path: "private path",
      requests: ["private request"],
    }),
    () => {},
  );
  assert.deepEqual(summary, {
    extensionVersion: "0.9.1",
    files: 17,
    serverVersion: "0.9.0-alpha.2",
  });
});
test("a stuck server cannot hold diagnostic summary collection open", async () => {
  let cancelled = false;
  const summary = await diagnosticSummary(
    {},
    () => new Promise(() => {}),
    () => {
      cancelled = true;
    },
    5,
  );
  assert.equal(cancelled, true);
  assert.match(String(summary.serverStatus), /unavailable/);
});

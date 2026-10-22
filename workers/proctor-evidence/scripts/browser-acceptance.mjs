import { recordingBrowserStack } from "./browser-stack.mjs";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../../../", import.meta.url)),
  session = `proctor-connected-${randomUUID().slice(0, 8)}`,
  scripts = [
    process.env.npm_execpath
      ? path.join(path.dirname(process.env.npm_execpath), "npx-cli.js")
      : "",
    path.join(
      path.dirname(process.execPath),
      "node_modules/npm/bin/npx-cli.js",
    ),
    path.resolve(
      path.dirname(process.execPath),
      "../lib/node_modules/npm/bin/npx-cli.js",
    ),
  ],
  npx = scripts.find((p) => p && existsSync(p));
assert.ok(npx);
async function cli(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      npx,
      "--yes",
      "--package",
      "@playwright/cli",
      "playwright-cli",
      `-s=${session}`,
      ...args,
    ], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let output = "", error = "";
    child.stdout.on("data", (c) => output += c);
    child.stderr.on("data", (c) => error += c);
    child.on("error", reject);
    child.on(
      "close",
      (code) =>
        code === 0 ? resolve(output) : reject(new Error(error || output)),
    );
  });
}
let fixture;
try {
  await mkdir(path.join(root, "output/playwright/proctor"), {
    recursive: true,
  });
  fixture = await recordingBrowserStack();
  await cli(["open", fixture.base + "/test/capture", "--browser", "chrome"]);
  await cli(["snapshot"]);
  const result = await cli([
      "run-code",
      "--filename",
      "scripts/connected-proctor-recording-browser.js",
    ]),
    json = /### Result\r?\n([^\r\n]+)/.exec(result)?.[1];
  assert.ok(json, result);
  const checks = JSON.parse(json);
  assert.equal(checks.connected_capture, true);
  assert.equal(checks.native_review_playback, true);
  assert.equal(checks.verified_seek, true);
  assert.equal(checks.revocation_teardown, true);
  assert.equal(checks.account_teardown, true);
  assert.equal(checks.observer_denied, true);
  assert.equal(checks.immutable_gaps, true);
  assert.equal(checks.human_recording_citations,true);assert.equal(checks.independent_quorum,true);assert.equal(checks.lost_finding_replay,true);assert.equal(checks.academic_scores_untouched,true);
  console.log(
    JSON.stringify({
      event: "proctor.connected.recording.acceptance",
      ...checks,
    }),
  );
} catch (cause) {
  try {
    console.error(await cli(["snapshot"]));
  } catch {}
  throw cause;
} finally {
  try {
    await cli(["close"]);
  } catch {}
  await fixture?.dispose();
}

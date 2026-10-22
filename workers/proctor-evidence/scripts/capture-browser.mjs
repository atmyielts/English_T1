import { createServer } from "node:http";
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../../../", import.meta.url)),
  session = `proctor-capture-${randomUUID().slice(0, 8)}`;
const scripts = [
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
assert.ok(npx, "An installed npm/npx runtime is required.");
const bundle = await build({
  stdin: {
    contents:
      "export {CaptureRecorder} from './packages/proctor-web/src/capture.ts';export {CaptureJournal} from './packages/proctor-web/src/capture-journal.ts';export {uploadCapture} from './packages/proctor-web/src/capture-upload.ts';",
    resolveDir: root,
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "iife",
  globalName: "ProctorCaptureFixture",
  platform: "browser",
  target: "es2022",
});
const server = createServer((req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.url === "/capture.js") {
    res.setHeader("Content-Type", "text/javascript");
    res.end(bundle.outputFiles[0].text);
  } else if (req.url === "/") {
    res.setHeader("Content-Type", "text/html");
    res.end(
      '<!doctype html><html lang="en"><head><title>Local synthetic Proctor capture verification</title></head><body><h1>Local synthetic capture verification</h1><p>No camera, microphone or personal screen is accessed.</p><script src="/capture.js"></script></body></html>',
    );
  } else {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const url = `http://127.0.0.1:${server.address().port}`;
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
try {
  await cli(["open", url, "--browser", "chrome"]);
  await cli(["snapshot"]);
  const result = await cli([
      "run-code",
      "--filename",
      "scripts/capture-browser-smoke.js",
    ]),
    json = /### Result\r?\n([^\r\n]+)/.exec(result)?.[1];
  assert.ok(json, result);
  const checks = JSON.parse(json);
  assert.equal(checks.decoded, true);
  assert.equal(checks.encrypted_recovery, true);
  assert.equal(checks.stop_tracks, true);
  assert.equal(checks.scope_isolation, true);
  assert.equal(checks.lost_reply_retry, true);
  assert.equal(checks.storage_failure_stops, true);
  assert.equal(checks.unsupported_stops, true);
  console.log(
    JSON.stringify({ event: "proctor.native.capture.acceptance", ...checks }),
  );
} finally {
  try {
    await cli(["close"]);
  } catch {}
  await new Promise((resolve) => server.close(resolve));
}

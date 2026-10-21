import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
const root = fileURLToPath(new URL("../../", import.meta.url));
test("actual Proctor live controls receive native video/audio, require explicit subscriptions and close withdrawn/stale feeds without stopping recording; identity and SFU are explicit fixture ports", async () => {
  const session = "proctor-live-ui-" + randomUUID().slice(0, 8),
    npx = [
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
    ].find((value) => value && existsSync(value));
  assert.ok(npx);
  const bundle = await build({
      entryPoints: [
        fileURLToPath(new URL("./ui-fixture.tsx", import.meta.url)),
      ],
      bundle: true,
      format: "iife",
      platform: "browser",
      jsx: "automatic",
      outdir: "fixture",
      write: false,
      loader: { ".ttf": "dataurl" },
      define: { "import.meta.env": "{}" },
    }),
    script =
      bundle.outputFiles.find((file) => file.path.endsWith(".js")).contents,
    css =
      bundle.outputFiles.find((file) => file.path.endsWith(".css")).contents;
  const server = createServer((req, res) => {
    res.setHeader("cache-control", "no-store");
    if (req.url === "/ui.js") {
      res.setHeader("content-type", "text/javascript");
      res.end(script);
    } else if (req.url === "/ui.css") {
      res.setHeader("content-type", "text/css");
      res.end(css);
    } else {
      res.setHeader("content-type", "text/html");
      res.end(
        '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Proctor live UI local acceptance</title><link rel="stylesheet" href="/ui.css"><div id="root"></div><script src="/ui.js"></script></html>',
      );
    }
  });
  await mkdir(path.join(root, "output/playwright"), { recursive: true });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const cli = (args) =>
    new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [
        npx,
        "--yes",
        "--package",
        "@playwright/cli",
        "playwright-cli",
        "-s=" + session,
        ...args,
      ], { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
      let output = "", error = "";
      child.stdout.on("data", (c) => output += c);
      child.stderr.on("data", (c) => error += c);
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve(output) : reject(Error(error || output)));
    });
  try {
    await cli([
      "open",
      `http://127.0.0.1:${server.address().port}`,
      "--browser",
      "chrome",
    ]);
    await cli(["snapshot"]);
    const result = await cli([
        "run-code",
        "--filename",
        "scripts/proctor-live-ui-browser.js",
      ]),
      raw = /### Result\r?\n([^\r\n]+)/.exec(result)?.[1];
    assert.ok(raw, result);
    const proof = JSON.parse(raw);
    for (
      const key of [
        "explicit_subscriptions",
        "candidate_capture_controls",
        "publisher_failure_preserves_recording",
        "publisher_reconnected_explicitly",
        "replacement_requires_choice",
        "microphone_muted_until_choice",
        "stalled_frame_hidden",
        "temporary_stall_recovered",
        "withdrawal_unmounted_feeds",
        "recording_preserved",
      ]
    ) assert.equal(proof[key], true, key);
    assert.deepEqual(proof.native_camera_dimensions, [320, 180]);
    assert.equal(proof.publish, 3);
    assert.equal(proof.subscribe, 3);
    assert.equal(proof.answer, 3);
    assert.equal(proof.viewerClosed, 3);
    assert.ok(proof.recording_chunks > 1);
    console.log(
      JSON.stringify({ event: "proctor.live.ui.native.acceptance", ...proof }),
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
    await new Promise((resolve) => server.close(resolve));
  }
});

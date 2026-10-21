import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { build } from "esbuild";
const root = fileURLToPath(new URL("../../", import.meta.url));
test("real browser native RTP/decode, stalled-frame hiding, permission teardown and independent recording; signaling is an explicit in-page SFU adapter", async () => {
  const session = "proctor-live-native-" + randomUUID().slice(0, 8),
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
      stdin: {
        contents:
          "import {LivePeer} from './packages/proctor-web/src/live-peer.ts';window.LivePeer=LivePeer;",
        resolveDir: root,
        loader: "ts",
      },
      bundle: true,
      format: "iife",
      platform: "browser",
      write: false,
    }),
    script = bundle.outputFiles[0].contents;
  const server = createServer((req, res) => {
    res.setHeader("cache-control", "no-store");
    if (req.url === "/peer.js") {
      res.setHeader("content-type", "text/javascript");
      res.end(script);
    } else {
      res.setHeader("content-type", "text/html");
      res.end(
        '<!doctype html><meta charset="utf-8"><title>Native Proctor media fixture</title><h1>Native live media fixture</h1><p>Generated video and explicit signaling adapter; not a hosted product screen.</p><video autoplay muted playsinline hidden></video><script src="/peer.js"></script>',
      );
    }
  });
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
        "scripts/native-live-peer-browser.js",
      ]),
      raw = /### Result\r?\n([^\r\n]+)/.exec(result)?.[1];
    assert.ok(raw, result);
    const proof = JSON.parse(raw);
    for (
      const key of [
        "native_video_rtp",
        "stale_frame_hidden",
        "temporary_stall_recovered",
        "withdrawn_feed_closed",
        "original_recording_preserved",
      ]
    ) assert.equal(proof[key], true, key);
    assert.equal(proof.publish, 1);
    assert.deepEqual(proof.decoded_dimensions, [320, 180]);
    assert.equal(proof.subscribe, 1);
    assert.equal(proof.answer, 1);
    assert.ok(proof.recording_chunks > 1);
    console.log(
      JSON.stringify({
        event: "proctor.live.native.peer.acceptance",
        ...proof,
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
    await new Promise((resolve) => server.close(resolve));
  }
});

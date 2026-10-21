import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../../../", import.meta.url)),
  session = `media-acceptance-${randomUUID().slice(0, 8)}`;
const imageResponses=process.argv.includes('--image-responses');
const mediaAnswers=process.argv.includes('--media-answers');
assert.ok(!(imageResponses&&mediaAnswers),'Run image-response and academic-answer journeys independently.');
const npmScripts = [
  process.env.npm_execpath
    ? path.join(path.dirname(process.env.npm_execpath), "npx-cli.js")
    : "",
  path.join(path.dirname(process.execPath), "node_modules/npm/bin/npx-cli.js"),
  path.resolve(
    path.dirname(process.execPath),
    "../lib/node_modules/npm/bin/npx-cli.js",
  ),
];
const npxScript = npmScripts.find((value) => value && existsSync(value));
assert.ok(
  npxScript,
  "Cannot locate the npm npx entrypoint. Run this command with the installed Node/npm runtime.",
);
const fixture = spawn(
  process.execPath,
  ["workers/assessment-media/scripts/browser-stack.mjs"],
  { cwd: root, env: {...process.env,ASSESSMENT_IMAGE_RESPONSE_TEST:imageResponses?'1':'0',ASSESSMENT_MEDIA_ANSWER_TEST:mediaAnswers?'1':'0'}, stdio: ["ignore", "pipe", "pipe", "ipc"] },
);
let output = "",
  error = "",
  exited = false;
fixture.stdout.on("data", (chunk) => (output += chunk));
fixture.stderr.on("data", (chunk) => (error += chunk));
const exit = new Promise((resolve, reject) => {
  fixture.on("error", reject);
  fixture.on("close", (code) => {
    exited = true;
    code === 0
      ? resolve()
      : reject(new Error(error || output || "Connected fixture failed"));
  });
});
void exit.catch(() => {});
async function cli(args) {
  return new Promise((resolve, reject) => {
    const program = spawn(
      process.execPath,
      [
        npxScript,
        "--yes",
        "--package",
        "@playwright/cli",
        "playwright-cli",
        `-s=${session}`,
        ...args,
      ],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
    );
    let result = "",
      failure = "";
    program.stdout.on("data", (chunk) => (result += chunk));
    program.stderr.on("data", (chunk) => (failure += chunk));
    program.on("error", reject);
    program.on("close", (code) =>
      code === 0
        ? resolve(result)
        : reject(
            new Error(failure || result || "Browser acceptance command failed"),
          ),
    );
  });
}
let configuration;
try {
  // Readiness includes 24 migrations, decoder fixture generation and two actual
  // immutable app builds. Observation silence is not process termination.
  for (let attempt = 0; attempt < 3000; attempt++) {
    if (exited) await exit;
    if (output.includes("Connected media browser fixture ready:")) {
      configuration = await (
        await fetch("http://localhost:5911/test/config")
      ).json();
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(configuration, "Connected fixture did not become ready within its five-minute startup budget");
  await cli(["open", configuration.institution, "--browser", "chrome"]);
  await cli(["snapshot"]);
  for (const file of mediaAnswers?['scripts/connected-answer-author-browser.js','scripts/connected-answer-candidate-browser.js','scripts/connected-answer-marking-browser.js']:[
    "scripts/connected-media-author-browser.js",
    imageResponses?'scripts/connected-image-response-browser.js':"scripts/connected-media-candidate-browser.js",
  ]) {
    const result = await cli(["run-code", "--filename", file]);
    const json = /### Result\r?\n([^\r\n]+)/.exec(result)?.[1];
    assert.ok(json, `No completed acceptance result from ${file}`);
    console.log(
      JSON.stringify({ script: path.basename(file), checks: JSON.parse(json) }),
    );
  }
  await exit;
  assert.ok(output.includes('"event":"media.browser.acceptance"'));
  console.log(
    "Passed full connected institution-to-candidate media acceptance. Hosted identity/provider/release gates remain separate.",
  );
} catch(cause){
  try{console.error(await cli(['snapshot']));}catch{}
  throw cause;
} finally {
  if (!exited && configuration) {
    try {
      await fetch(`${configuration.base}/test/stop`, {
        method: "POST",
        headers: { "x-fixture-control": configuration.control },
      });
    } catch {}
  }
  try {
    await cli(["close"]);
  } catch {}
  if (!exited) {
    // Windows process.kill is not a graceful Node shutdown. IPC lets the child
    // abort an in-progress build and execute its validated database/temp cleanup.
    if (fixture.connected) await new Promise(resolve=>fixture.send({type:'assessment.fixture.stop'},()=>resolve()));
    // Native scanner subprocesses have their own bounded execution. Let a live
    // job drain before removing its authority/database instead of hard-killing
    // the fixture because one observation expired.
    await exit.catch(() => {});
  }
}

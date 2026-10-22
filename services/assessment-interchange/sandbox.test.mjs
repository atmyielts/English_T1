import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createHash, randomUUID } from "node:crypto";
import { IMAGE, isolationArgs, sandbox } from "./run.mjs";
const exec = promisify(execFile);
const source = Buffer.from(JSON.stringify({
  schema_version: "assessment.qti-export-input.v1",
  rows: [{
    id: "version-1",
    item: {
      schema_version: "assessment.item.v1",
      type: "single_choice",
      locale: "en",
      prompt: "Choose",
      options: [{ id: "A", text: "One" }, { id: "B", text: "Two" }],
      tags: [],
      max_score: 3,
    },
    key: { correct: "A" },
  }],
}));
test("actual isolated export -> package inspection -> review -> draft proposal with exact pinned source", async () => {
  let identity;
  const built = await sandbox(source, "export-choices", {
    onCreated: async (name) => {
      identity = name;
      const { stdout } = await exec("docker", ["inspect", name]);
      const config = JSON.parse(stdout)[0];
      assert.equal(config.HostConfig.NetworkMode, "none");
      assert.equal(config.HostConfig.ReadonlyRootfs, true);
      assert.equal(config.Config.User, "10001:10001");
      assert.deepEqual(config.Mounts, []);
      assert.equal(config.HostConfig.Memory, 512 * 1048576);
      assert.equal(config.HostConfig.PidsLimit, 32);
      assert.deepEqual(config.Config.Entrypoint.slice(0, 3), [
        "/usr/bin/timeout",
        "--signal=KILL",
        "45s",
      ]);
      assert.ok(config.HostConfig.SecurityOpt.includes("no-new-privileges"));
      assert.equal(
        config.Config.Env.some((value) =>
          /SUPABASE|CLOUDFLARE|SECRET|TOKEN|PASSWORD/.test(value)
        ),
        false,
      );
    },
  });
  assert.equal(built.publishable, false);
  assert.equal(built.source_rows[0].source_id, "version-1");
  const zip = Buffer.from(built.zip_base64, "base64");
  assert.equal(
    createHash("sha256").update(zip).digest("hex"),
    built.package_hash,
  );
  const inspected = await sandbox(zip, "inspect");
  assert.equal(inspected.runnable, false);
  assert.equal(inspected.resources.length, 1);
  const review = await sandbox(zip, "review");
  assert.equal(review.requires_human_review, true);
  assert.deepEqual(review.diagnostics, []);
  const mapped = await sandbox(zip, "candidates");
  assert.equal(mapped.draft_candidates[0].item.max_score, 3);
  assert.equal(mapped.draft_candidates[0].key.correct, "A");
  assert.equal(mapped.publishable, false);
  assert.deepEqual(mapped.blocked, []);
  await assert.rejects(exec("docker", ["inspect", identity]));
});
test("sandbox refuses changed source receipts, bad package bytes and malformed export requests", async () => {
  await assert.rejects(
    sandbox(source, "export-choices", { expectedHash: "0".repeat(64) }),
    (cause) => cause.code === "source_hash",
  );
  await assert.rejects(
    sandbox(Buffer.from("not zip"), "review"),
    (cause) => cause.code === "zip_format",
  );
  await assert.rejects(
    sandbox(Buffer.from("{"), "export-choices"),
    (cause) => cause.code === "export_request",
  );
  await assert.rejects(
    sandbox(Buffer.from("null"), "export-choices"),
    (cause) => cause.code === "export_request",
  );
});
test("deadline kills the same known container, waits for terminal state and cleans it up", async () => {
  let identity;
  await assert.rejects(
    sandbox(source, "export-choices", {
      timeoutMs: 1,
      onCreated: (name) => {
        identity = name;
      },
    }),
    /deadline/,
  );
  await assert.rejects(exec("docker", ["inspect", identity]));
});
test("real sandbox user cannot write its root or connect to an external address", async () => {
  const name = `assessment-interchange-${randomUUID()}`;
  const program =
    `const fs=require('node:fs'),net=require('node:net');let readOnly=false;try{fs.writeFileSync('/forbidden','x')}catch{readOnly=true}const s=net.connect({host:'1.1.1.1',port:443});let done=false;const finish=network=>{if(done)return;done=true;s.destroy();console.log(JSON.stringify({uid:process.getuid(),readOnly,network}));};s.once('connect',()=>finish(true));s.once('error',()=>finish(false));s.setTimeout(1200,()=>finish(false));`;
  try {
    const { stdout } = await exec("docker", [
      "run",
      "--rm",
      ...isolationArgs(name),
      "--pull=never",
      "--entrypoint=node",
      IMAGE,
      "--eval",
      program,
    ], { timeout: 15000 });
    assert.deepEqual(JSON.parse(stdout), {
      uid: 10001,
      readOnly: true,
      network: false,
    });
  } finally {
    await exec("docker", ["rm", "--force", name]).catch(() => {});
  }
});
test("OS deadline terminates blocked JavaScript independently of the host processing timer", async () => {
  const name = `assessment-interchange-${randomUUID()}`, start = Date.now();
  try {
    await assert.rejects(
      exec("docker", [
        "run",
        "--rm",
        ...isolationArgs(name),
        "--pull=never",
        "--entrypoint=/usr/bin/timeout",
        IMAGE,
        "--signal=KILL",
        "0.1s",
        "node",
        "--eval",
        "while(true){}",
      ], { timeout: 15000 }),
      (cause) => cause.code === 137,
    );
    assert.ok(Date.now() - start < 15000);
  } finally {
    await exec("docker", ["rm", "--force", name]).catch(() => {});
  }
});

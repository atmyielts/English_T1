import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../../", import.meta.url));
function command(args, { input, signal, onLimit } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      }),
      out = [];
    let size = 0;
    child.on("error", reject);
    child.stdin.on("error", () => {});
    child.stdout.on("data", (chunk) => {
      size += chunk.length;
      if (size > 100000) onLimit?.();
      else out.push(chunk);
    });
    child.stderr.resume();
    child.on(
      "close",
      (code) => resolve({ code, output: Buffer.concat(out).toString("utf8") }),
    );
    child.stdin.end(input);
  });
}
export async function scanSource(
  bytes,
  expectedHash,
  {
    database = process.env.ASSESSMENT_SCANNER_DATABASE ||
      path.join(root, "output/assessment-scanner/signatures"),
    signal,
    onCreated,
  } = {},
) {
  if (
    !(bytes instanceof Uint8Array) || bytes.length < 22 ||
    bytes.length > 64 * 1048576 || !/^[a-f0-9]{64}$/.test(expectedHash)
  ) throw new Error("Bounded exact-source scan input required.");
  const signatures = await realpath(database),
    program = await realpath(
      fileURLToPath(new URL("qti-scan.py", import.meta.url)),
    ),
    name = `assessment-qti-scan-${randomUUID()}`;
  let created = false, timer, killing, watchdog;
  const kill = () => {
    if (!killing) {
      const pending = command(["kill", name]);
      killing = pending;
      pending.finally(() => {
        if (killing === pending) killing = null;
      }).catch(() => {});
    }
    return killing;
  };
  const abort = () => {
    void kill().catch(() => {});
    watchdog ??= setInterval(() => void kill().catch(() => {}), 200);
  };
  try {
    if ([signatures, program].some((value) => value.includes(","))) {
      throw new Error("Ambiguous scanner mount path.");
    }
    const image = await command([
      "image",
      "inspect",
      process.env.ASSESSMENT_QTI_SCANNER_IMAGE ||
        "schood-assessment-scanner-local",
      "--format",
      "{{.Id}}",
    ]);
    const imageId = image.output.trim();
    if (image.code !== 0 || !/^sha256:[a-f0-9]{64}$/.test(imageId)) {
      throw new Error("An approved local scanner image is required.");
    }
    const user = process.getuid
      ? `${process.getuid()}:${process.getgid()}`
      : "10001:10001";
    const made = await command([
      "create",
      "--interactive",
      "--name",
      name,
      "--label",
      "schood.assessment-qti.scan=true",
      "--network=none",
      "--read-only",
      "--user",
      user,
      "--cap-drop=ALL",
      "--security-opt=no-new-privileges",
      "--pids-limit=64",
      "--memory=2g",
      "--memory-swap=2g",
      "--cpus=1",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=256m",
      "--mount",
      `type=bind,src=${signatures},dst=/signatures,readonly`,
      "--mount",
      `type=bind,src=${program},dst=/qti-scan.py,readonly`,
      "--pull=never",
      "--entrypoint=/usr/bin/timeout",
      imageId,
      "--signal=KILL",
      "180s",
      "python3",
      "/qti-scan.py",
      "--expected-hash",
      expectedHash,
    ]);
    if (made.code !== 0) {
      throw new Error("Cannot create the isolated source scanner.");
    }
    created = true;
    await onCreated?.(name);
    if (signal?.aborted) throw new Error("Source scan cancelled.");
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(abort, 185000);
    const result = await command(["start", "--attach", "--interactive", name], {
      input: bytes,
      onLimit: abort,
    });
    if (signal?.aborted) throw new Error("Source scan cancelled.");
    if (result.code !== 0) {
      throw new Error(
        "Source scanning failed operationally; no verdict was committed.",
      );
    }
    let receipt;
    try {
      receipt = JSON.parse(result.output);
    } catch {
      throw new Error("Source scanner returned no bounded receipt.");
    }
    if (
      receipt.schema_version !== "assessment.qti-scan.v2" ||
      receipt.source_hash !== expectedHash ||
      receipt.byte_length !== bytes.length
    ) throw new Error("Source scanner returned a mismatched receipt.");
    return receipt;
  } finally {
    clearTimeout(timer);
    clearInterval(watchdog);
    signal?.removeEventListener("abort", abort);
    if (killing) await killing.catch(() => {});
    if (created) {
      const removed = await command(["rm", "--force", name]);
      if (removed.code !== 0) throw new Error("Source scanner cleanup failed.");
    }
  }
}

import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
const directory = path.dirname(fileURLToPath(import.meta.url));
export const IMAGE = "schood-assessment-interchange-local:latest";
const OUTPUT_LIMIT = 32 * 1048576;
export function isolationArgs(name) {
  if (!/^assessment-interchange-[a-f0-9-]{36}$/.test(name)) {
    throw new Error("Invalid sandbox identity.");
  }
  return [
    "--name",
    name,
    "--network=none",
    "--read-only",
    "--user=10001:10001",
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges",
    "--pids-limit=32",
    "--memory=512m",
    "--memory-swap=512m",
    "--cpus=1",
    "--ulimit=nofile=64:64",
    "--label=schood.assessment-interchange.fixture=true",
  ];
}
function command(args, { input, limit = OUTPUT_LIMIT, onStarted } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      }),
      out = [],
      err = [];
    let count = 0, failed = null;
    child.on("error", reject);
    child.stdin.on("error", () => {});
    child.stdout.on("data", (chunk) => {
      count += chunk.length;
      if (count > limit) {
        failed ??= new Error("Sandbox output limit exceeded.");
        onStarted?.(failed);
      } else out.push(chunk);
    });
    let errBytes = 0;
    child.stderr.on("data", (chunk) => {
      errBytes += chunk.length;
      if (errBytes <= 16384) err.push(chunk);
    });
    child.on(
      "close",
      (code) =>
        failed ? reject(failed) : resolve({
          code,
          stdout: Buffer.concat(out),
          stderr: Buffer.concat(err).toString("utf8"),
        }),
    );
    child.stdin.end(input);
  });
}
export async function build() {
  const result = await command([
    "build",
    "--tag",
    IMAGE,
    "--build-context",
    `core=${path.resolve(directory, "../../packages/assessment-core/src")}`,
    directory,
  ], { limit: 1048576 });
  if (result.code !== 0) {
    throw new Error(`Interchange image build failed: ${result.stderr}`);
  }
  return result;
}
/** No mounts, secret environment variables, provider credentials or network.
 * Timeout terminates the known container, then awaits its attached process;
 * observations do not start replacement jobs. */
export async function sandbox(
  input,
  operation = "candidates",
  { expectedHash, onCreated, timeoutMs = 45000, imageId, signal } = {},
) {
  if (!(input instanceof Uint8Array) || input.length > 64 * 1048576) {
    throw new Error("Bounded byte input required.");
  }
  if (
    !["inspect", "review", "candidates", "export-choices"].includes(operation)
  ) throw new Error("Unknown interchange operation.");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 45000) {
    throw new Error("Invalid sandbox deadline.");
  }
  if (imageId !== undefined && !/^sha256:[a-f0-9]{64}$/.test(imageId)) {
    throw new Error("Use an exact approved local processing image identity.");
  }
  const hash = expectedHash ?? createHash("sha256").update(input).digest("hex");
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error("Exact lowercase source SHA-256 required.");
  }
  const name = `assessment-interchange-${randomUUID()}`;
  let created = false,
    timer,
    watchdog,
    killing = null,
    expired = false,
    cancelled = false;
  const kill = () => {
    if (killing) return killing;
    const pending = command(["kill", name], { limit: 16384 });
    killing = pending;
    pending.finally(() => {
      if (killing === pending) killing = null;
    }).catch(() => {});
    return pending;
  };
  const abort = () => {
    cancelled = true;
    void kill().catch(() => {});
    watchdog ??= setInterval(() => void kill().catch(() => {}), 200);
  };
  try {
    const made = await command([
      "create",
      "--interactive",
      ...isolationArgs(name),
      "--pull=never",
      imageId ?? IMAGE,
      operation,
      hash,
    ], { limit: 16384 });
    if (made.code !== 0) {
      throw new Error(
        `Cannot create isolated interchange process: ${made.stderr}`,
      );
    }
    created = true;
    await onCreated?.(name);
    if (signal?.aborted) throw new Error("Interchange processing cancelled.");
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => {
      expired = true;
      void kill().catch(() => {});
      watchdog = setInterval(() => void kill().catch(() => {}), 200);
    }, timeoutMs);
    const result = await command(["start", "--attach", "--interactive", name], {
      input,
      limit: OUTPUT_LIMIT,
      onStarted: () => void kill().catch(() => {}),
    });
    if (killing) await killing;
    if (cancelled) throw new Error("Interchange processing cancelled.");
    if (expired) throw new Error("Interchange processing deadline exceeded.");
    let envelope;
    try {
      envelope = JSON.parse(result.stdout.toString("utf8"));
    } catch {
      throw new Error("Isolated interchange returned no valid bounded result.");
    }
    if (result.code !== 0 || envelope?.ok !== true) {
      throw Object.assign(
        new Error(envelope?.error?.message ?? "Isolated interchange failed."),
        { code: envelope?.error?.code ?? "sandbox_failed" },
      );
    }
    return envelope.data;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
    clearInterval(watchdog);
    if (created) {
      if (killing) await killing.catch(() => {});
      const removed = await command(["rm", "--force", name], { limit: 16384 });
      if (removed.code !== 0) {
        throw new Error(
          "Sandbox cleanup failed; inspect the exact generated container identity.",
        );
      }
    }
  }
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const action = process.argv[2];
  if (action !== "build") {
    throw new Error(
      "Use build; trusted callers invoke sandbox with exact private source bytes.",
    );
  }
  const result = await build();
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}

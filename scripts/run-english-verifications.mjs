import { spawnSync } from "node:child_process";

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const status = spawnSync("supabase", ["status", "-o", "env"], {
  encoding: "utf8",
  shell: false,
});

if (status.status !== 0) {
  process.stderr.write(status.stderr || "Failed to read local Supabase status.\n");
  process.exit(status.status ?? 1);
}

const env = { ...process.env };
for (const rawLine of status.stdout.split(/\r?\n/)) {
  const line = rawLine.trim();
  if (!line || !line.includes("=") || line.startsWith("WARN:")) continue;
  const separator = line.indexOf("=");
  const key = line.slice(0, separator).trim();
  const rawValue = line.slice(separator + 1).trim();
  if (!key) continue;
  env[key] = rawValue.replace(/^"|"$/g, "");
}

run("supabase", ["db", "lint"], { env });
run("deno", [
  "test",
  "--allow-env",
  "--allow-net",
  "supabase/tests/english-verification.integration.test.ts",
], { env });

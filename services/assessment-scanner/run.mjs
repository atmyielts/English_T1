import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
const image =
  process.env.ASSESSMENT_SCANNER_IMAGE ?? "schood-assessment-scanner-local";
const database = path.resolve(
  process.env.ASSESSMENT_SCANNER_DATABASE ??
    path.join(root, "output/assessment-scanner/signatures"),
);
const mode = process.argv[2];
if (!["build", "update", "test", "decoder-test"].includes(mode))
  throw new Error("Use build, update, test or decoder-test.");
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, { cwd: root, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`Scanner ${mode} failed (${code}).`)),
    );
  });
}
if (mode === "build")
  await run(["build", "--tag", image, "services/assessment-scanner"]);
else if(mode === "decoder-test")
  await run(["run","--rm","--network","none","--read-only","--cap-drop","ALL","--security-opt","no-new-privileges","--pids-limit","64","--memory","256m","--cpus","2","--tmpfs","/tmp:rw,noexec,nosuid,size=32m","--mount",`type=bind,src=${path.join(root,"services/assessment-scanner/decoder_test.py")},dst=/app/decoder_test.py,readonly`,"--entrypoint","python3",image,"/app/decoder_test.py"]);
else {
  if (database.includes(","))
    throw new Error("The signature path cannot contain commas.");
  if (mode === "update") await mkdir(database, { recursive: true });
  if (!(await stat(database)).isDirectory())
    throw new Error("A signature directory is required.");
  const args = [
    "run",
    "--rm",
    "--mount",
    `type=bind,src=${database},dst=/signatures${mode === "test" ? ",readonly" : ""}`,
  ];
  if (process.getuid)
    args.push("--user", `${process.getuid()}:${process.getgid()}`);
  if (mode === "update")
    args.push(
      "--mount",
      `type=bind,src=${path.join(root, "services/assessment-scanner/freshclam.conf")},dst=/etc/freshclam.conf,readonly`,
      "--entrypoint",
      "freshclam",
      image,
      "--config-file=/etc/freshclam.conf",
      "--stdout",
    );
  else
    args.push(
      "--network",
      "none",
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--pids-limit",
      "64",
      "--memory",
      "4g",
      "--cpus",
      "2",
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=256m",
      "--mount",
      `type=bind,src=${path.join(root, "services/assessment-scanner/smoke.py")},dst=/app/smoke.py,readonly`,
      "--entrypoint",
      "python3",
      image,
      "/app/smoke.py",
    );
  await run(args);
}

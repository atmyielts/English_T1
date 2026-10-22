import { build } from "esbuild";
import { fileURLToPath } from "node:url";
await build({
  entryPoints: [
    fileURLToPath(
      new URL("../../workers/assessment-qti/src/index.ts", import.meta.url),
    ),
  ],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: fileURLToPath(
    new URL("../../workers/assessment-qti/dist/index.js", import.meta.url),
  ),
});

import { parentPort, workerData } from "node:worker_threads";
import { renderCertificate } from "./renderer.mjs";
try {
  const value = await renderCertificate(workerData);
  parentPort.postMessage(value, [value.bytes.buffer]);
} catch {
  parentPort.postMessage({ error: "document_render_rejected" });
}

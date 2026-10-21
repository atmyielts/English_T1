/// <reference lib="deno.ns" />
import { prepareQtiSource, transferQtiSource } from "./qti-source.ts";
const bank = "10000000-0000-4000-8000-000000000001";
function assert(value: unknown, message = "Assertion failed"): asserts value {
  if (!value) throw new Error(message);
}
async function rejects(work: () => Promise<unknown>) {
  try {
    await work();
  } catch {
    return;
  }
  throw new Error("Expected failure");
}
Deno.test("QTI browser preparation pins ordered parts and recovery requires identical bank/file", async () => {
  const bytes = new Uint8Array(1048598);
  bytes.fill(42);
  const prepared = await prepareQtiSource(
    new File([bytes], "placement.zip"),
    bank,
  );
  assert(prepared.manifest.parts.length === 2);
  const received: number[] = [], job = { ...prepared.manifest };
  const ports = {
    active() {},
    async part(index: number, part: ArrayBuffer) {
      received.push(part.byteLength);
      assert(index === received.length - 1);
    },
    async complete() {
      received.push(-1);
    },
    progress() {},
  };
  await transferQtiSource(prepared, job, ports);
  assert(JSON.stringify(received) === JSON.stringify([1048576, 22, -1]));
  await rejects(() =>
    transferQtiSource(prepared, { ...job, source_hash: "b".repeat(64) }, ports)
  );
  await rejects(() =>
    transferQtiSource(prepared, {
      ...job,
      bank_id: "20000000-0000-4000-8000-000000000001",
    }, ports)
  );
  prepared.bytes[0] ^= 1;
  await rejects(() => transferQtiSource(prepared, job, ports));
  assert(received.length === 3);
});
Deno.test("QTI browser transfer never completes a failed or cancelled part and safely retries exact bytes", async () => {
  const prepared = await prepareQtiSource(
    new File([new Uint8Array(22)], "exam.zip"),
    bank,
  );
  let calls = 0, completed = 0, active = true;
  const ports = {
    active() {
      if (!active) throw new Error("Workspace closed");
    },
    async part() {
      calls++;
      if (calls === 1) throw new Error("Receipt reply lost");
    },
    async complete() {
      completed++;
    },
    progress() {},
  };
  await rejects(() => transferQtiSource(prepared, prepared.manifest, ports));
  assert(completed === 0);
  await transferQtiSource(prepared, prepared.manifest, ports);
  assert(Number(completed) === 1 && calls === 2);
  active = false;
  await rejects(() => transferQtiSource(prepared, prepared.manifest, ports));
  assert(calls === 2);
});
Deno.test("QTI browser rejects invalid files before reading and fences a changed selection", async () => {
  for (
    const file of [
      new File(["bad"], "bad.zip"),
      new File([new Uint8Array(22)], "wrong.xml"),
    ]
  ) await rejects(() => prepareQtiSource(file, bank));
  await rejects(() =>
    prepareQtiSource(new File([new Uint8Array(22)], "test.zip"), bank, () => {
      throw new Error("Selection changed");
    })
  );
});

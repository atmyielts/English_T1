import { assertEquals, assertMatch, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { signTelegramInitDataForTest } from "../_shared/telegram-init-data.ts";
import { normalizePhone, slugify } from "./catalog.ts";
import { HttpError } from "./core.ts";
import { miniAppHomework, miniAppSubmit } from "./miniapp.ts";
import { FakeDb } from "./test-fakes.ts";

type Row = Record<string, unknown>;
const TOKEN = "123456:test-token";
const U = "11111111-1111-4111-8111-111111111111";
const A1 = "a1a1a1a1-0000-4000-8000-000000000001", C1 = "c1c1c1c1-0000-4000-8000-000000000001";
const K1 = "b1b1b1b1-0000-4000-8000-000000000001", H1 = "d1d1d1d1-0000-4000-8000-000000000001";

const initData = (userId = "555") => signTelegramInitDataForTest(
  { auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: Number(userId), first_name: "Ali" }) }, TOKEN);

const setup = (flag = true) => {
  const db = new FakeDb({
    users: [{ id: U, telegram_chat_id: "555", full_name: "Ali" }],
    tenants: [{ id: A1, name: "Alpha Centre" }],
    academy_classroom_memberships: [{ academy_id: A1, classroom_id: K1, contact_id: C1, role: "student", status: "active" }],
    academy_assignments: [{ id: H1, academy_id: A1, classroom_id: K1, title: "Unit 5 essay", due_at: null, released_at: null, status: "active", attempts_allowed: 1, allow_late_submission: true }],
    academy_submissions: [],
  }, {
    academy_learning_flag: () => ({ data: flag }),
    academy_learning_allows: () => ({ data: true }),
    academy_student_contacts_command: () => ({ data: { actor_id: U, contacts: [{ id: C1, academy_id: A1 }] } }),
    academy_assignment_written_command: (args) => ({ data: { id: "s1", academy_id: A1, assignment_id: args.p_assignment, contact_id: C1, attempt_number: 1, status: "submitted" } }),
  });
  const uploads: string[] = [];
  const upload = (path: string) => { uploads.push(path); return Promise.resolve({ bucket: "media", path }); };
  return { db, uploads, deps: { sb: db, botToken: TOKEN, upload: upload as never } };
};

Deno.test("the Mini App lists open homework for a signed Telegram session", async () => {
  const { deps } = setup();
  const out = await miniAppHomework(deps, { initData: await initData() });
  assertEquals(out.enabled, true);
  assertEquals((out.work as Row[]).map((w) => w.title), ["Unit 5 essay"]);
});

Deno.test("a forged or foreign session is refused", async () => {
  const { deps } = setup();
  await assertRejects(() => miniAppHomework(deps, { initData: "user=%7B%22id%22%3A555%7D&hash=bad" }), HttpError, "Telegram bot again");
  await assertRejects(async () => miniAppHomework(deps, { initData: await initData("999") }), HttpError, "Link your Schood account");
});

Deno.test("files upload under the classroom prefix and go through the written command", async () => {
  const { deps, db, uploads } = setup();
  const form = new FormData();
  form.set("init_data", await initData());
  form.set("assignment_id", H1);
  form.set("text", "My essay attached");
  form.append("files", new File([new Uint8Array([1, 2, 3])], "page1.jpg", { type: "image/jpeg" }));
  form.append("files", new File([new Uint8Array([4, 5])], "essay.pdf", { type: "application/pdf" }));
  const out = await miniAppSubmit(deps, form);
  assertEquals(out.kind, "submission");
  assertEquals(uploads.length, 2);
  assertMatch(uploads[0], new RegExp(`^academy/${A1}/classrooms/${K1}/submission/[0-9a-f-]{36}\\.jpg$`));
  const payload = db.rpcCalls.find((c) => c.name === "academy_assignment_written_command")!.args.p_payload as Row;
  const meta = payload.metadata as Row;
  assertEquals(meta.source, "telegram_app");
  assertEquals((meta.pages as Row[]).length, 1);
  assertEquals(payload.submission_content, "My essay attached");
});

Deno.test("closed homework, empty answers and switched-off hand-in are refused", async () => {
  const { deps } = setup();
  const form = new FormData();
  form.set("init_data", await initData());
  form.set("assignment_id", "d9d9d9d9-0000-4000-8000-000000000009");
  form.set("text", "hi");
  await assertRejects(() => miniAppSubmit(deps, form), HttpError, "no longer open");
  const empty = new FormData();
  empty.set("init_data", await initData());
  empty.set("assignment_id", H1);
  await assertRejects(() => miniAppSubmit(deps, empty), HttpError, "Add a file");
  const off = setup(false);
  await assertRejects(() => miniAppSubmit(off.deps, form), HttpError, "not switched on");
});

Deno.test("catalogue helpers keep slugs and phone numbers clean", () => {
  assertMatch(slugify("IELTS 7+ кечки гуруҳ!"), /^ielts-7-[a-z0-9-]*[0-9a-f]{6}$/);
  assertEquals(normalizePhone("+998 (90) 123-45-67"), "+998901234567");
  assertEquals(normalizePhone("12"), null);
});

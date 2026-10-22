import { assert, assertEquals, assertMatch } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { FakeDb, FakeTelegram } from "./test-fakes.ts";
import { handleTelegramUpdate } from "./telegram.ts";

type Row = Record<string, unknown>;

const U = "11111111-1111-4111-8111-111111111111";
const A1 = "a1a1a1a1-0000-4000-8000-000000000001", A2 = "a2a2a2a2-0000-4000-8000-000000000002";
const C1 = "c1c1c1c1-0000-4000-8000-000000000001", C2 = "c2c2c2c2-0000-4000-8000-000000000002";
const K1 = "b1b1b1b1-0000-4000-8000-000000000001", K2 = "b2b2b2b2-0000-4000-8000-000000000002";
const H1 = "d1d1d1d1-0000-4000-8000-000000000001", H2 = "d2d2d2d2-0000-4000-8000-000000000002";
const future = new Date(Date.now() + 2 * 86400_000).toISOString();

const setup = (opts: { flag?: boolean; centres?: Array<[string, string]>; submissions?: Row[]; attempts?: number } = {}) => {
  const centres = opts.centres ?? [[A1, C1], [A2, C2]];
  const db = new FakeDb({
    users: [{ id: U, telegram_chat_id: "555", full_name: "Ali Valiyev", email: "ali@example.com" }],
    tenants: [{ id: A1, name: "Alpha Centre" }, { id: A2, name: "Beta Centre" }],
    academy_classroom_memberships: [
      { academy_id: A1, classroom_id: K1, contact_id: C1, role: "student", status: "active" },
      { academy_id: A2, classroom_id: K2, contact_id: C2, role: "student", status: "active" },
    ],
    academy_assignments: [
      { id: H1, academy_id: A1, classroom_id: K1, title: "Unit 5 essay", description: "Write 150 words.", due_at: future, released_at: null, status: "active", attempts_allowed: opts.attempts ?? 1, allow_late_submission: true },
      { id: H2, academy_id: A2, classroom_id: K2, title: "Worksheet 3", description: "Page 12.", due_at: future, released_at: null, status: "active", attempts_allowed: 1, allow_late_submission: true },
    ],
    academy_submissions: opts.submissions ?? [],
  }, {
    academy_learning_flag: () => ({ data: opts.flag !== false }),
    academy_learning_allows: () => ({ data: true }),
    academy_student_contacts_command: () => ({ data: { actor_id: U, contacts: centres.map(([academy_id, id]) => ({ id, academy_id })) } }),
    academy_telegram_draft_append: (args, fake) => {
      const drafts = fake.table("academy_telegram_handin_drafts");
      if (args.p_media_group) {
        const existing = drafts.find((d) => d.user_id === args.p_user && d.media_group_id === args.p_media_group);
        if (existing) {
          (existing.items as Row[]).push(args.p_item as Row);
          return { data: { draft: existing, created: false } };
        }
      }
      const draft = {
        id: crypto.randomUUID(), user_id: args.p_user, chat_id: args.p_chat, media_group_id: args.p_media_group ?? null,
        items: args.p_item ? [args.p_item] : [], text_content: args.p_text ?? null, options: [], status: "open",
        expires_at: new Date(Date.now() + 1800_000).toISOString(),
      };
      drafts.push(draft);
      return { data: { draft, created: true } };
    },
    academy_assignment_written_command: (args, fake) => {
      const assignment = fake.table("academy_assignments").find((a) => a.id === args.p_assignment)!;
      const row = {
        id: crypto.randomUUID(), academy_id: args.p_academy, assignment_id: args.p_assignment, classroom_id: assignment.classroom_id,
        contact_id: args.p_academy === A1 ? C1 : C2, user_id: args.p_actor, attempt_number: 1, status: "submitted",
        submission_content: (args.p_payload as Row).submission_content, metadata: (args.p_payload as Row).metadata,
      };
      fake.table("academy_submissions").push(row);
      return { data: row };
    },
  });
  const tg = new FakeTelegram();
  tg.files["photo-big"] = new Uint8Array([1, 2, 3, 4]);
  tg.files["photo-2"] = new Uint8Array([5, 6, 7]);
  const uploads: string[] = [];
  const deps = {
    sb: db, tg, siteUrl: "https://schood.online",
    upload: (path: string) => { uploads.push(path); return Promise.resolve({ bucket: "media", path }); },
  };
  return { db, tg, deps, uploads };
};

const photoMessage = (extra: Row = {}) => ({
  message: {
    message_id: 1, chat: { id: 555, type: "private" }, from: { id: 555 },
    photo: [{ file_id: "photo-small", file_unique_id: "u-small", file_size: 900, width: 90, height: 120 }, { file_id: "photo-big", file_unique_id: "u-big", file_size: 4, width: 1280, height: 1706 }],
    ...extra,
  },
});

const callback = (data: string) => ({ callback_query: { id: "cb1", data, from: { id: 555 }, message: { chat: { id: 555, type: "private" } } } });

Deno.test("does nothing while Telegram hand-in is switched off", async () => {
  const { deps, tg } = setup({ flag: false });
  assertEquals(await handleTelegramUpdate(deps as never, photoMessage()), { handled: false });
  assertEquals(tg.calls.length, 0);
});

Deno.test("leaves plain text to the bot for learners without a homework centre", async () => {
  const { deps, tg } = setup({ centres: [] });
  const result = await handleTelegramUpdate(deps as never, { message: { chat: { id: 555, type: "private" }, from: { id: 555 }, text: "hello" } });
  assertEquals(result, { handled: false });
  assertEquals(tg.messages().length, 0);
});

Deno.test("asks which homework when two centres have open work, then files the chosen one", async () => {
  const { deps, tg, db, uploads } = setup();
  assertEquals(await handleTelegramUpdate(deps as never, photoMessage({ caption: "my answer" })), { handled: true });
  const prompt = tg.calls.find((c) => c.method === "sendMessage")!;
  assertMatch(String(prompt.body.text), /Which homework/);
  const keyboard = (prompt.body.reply_markup as Row).inline_keyboard as Array<Array<Row>>;
  assertEquals(keyboard.length, 3); // two choices + cancel
  const pick = keyboard.find((row) => String(row[0].text).includes("Unit 5 essay"))![0];

  await handleTelegramUpdate(deps as never, callback(String(pick.callback_data)));
  const written = db.rpcCalls.find((c) => c.name === "academy_assignment_written_command")!;
  assertEquals(written.args.p_assignment, H1);
  assertEquals(written.args.p_actor, U);
  const payload = written.args.p_payload as Row;
  assertEquals(payload.submission_content, "my answer");
  const meta = payload.metadata as Row;
  assertEquals(meta.response_kind, "file");
  assertEquals(meta.source, "telegram_bot");
  assertMatch(String((meta.storage as Row).path), new RegExp(`^academy/${A1}/classrooms/${K1}/submission/[0-9a-f-]{36}\\.jpg$`));
  assertEquals((meta.storage as Row).telegram_file_unique_id, "u-big");
  assertEquals(uploads.length, 1);
  assertMatch(tg.messages().at(-1)!, /Received 1 file for <b>Unit 5 essay<\/b> · Alpha Centre/);
});

Deno.test("a second tap on the same choice does not hand in twice", async () => {
  const { deps, db, tg } = setup();
  await handleTelegramUpdate(deps as never, photoMessage());
  const keyboard = ((tg.calls[0].body.reply_markup as Row).inline_keyboard as Array<Array<Row>>);
  const data = String(keyboard[0][0].callback_data);
  await handleTelegramUpdate(deps as never, callback(data));
  await handleTelegramUpdate(deps as never, callback(data));
  assertEquals(db.rpcCalls.filter((c) => c.name === "academy_assignment_written_command").length, 1);
  assertMatch(tg.messages().at(-1)!, /already sent or has expired/);
});

Deno.test("switching to one centre files straight away", async () => {
  const { deps, db, tg } = setup();
  await handleTelegramUpdate(deps as never, callback(`ctr:${A2}`));
  assertEquals(db.table("telegram_student_preferences")[0].active_academy_id, A2);
  await handleTelegramUpdate(deps as never, photoMessage());
  const written = db.rpcCalls.filter((c) => c.name === "academy_assignment_written_command");
  assertEquals(written.length, 1);
  assertEquals(written[0].args.p_assignment, H2);
  assertMatch(tg.messages().at(-1)!, /Worksheet 3<\/b> · Beta Centre/);
});

Deno.test("an album becomes one hand-in with every page", async () => {
  const { deps, db, tg } = setup({ centres: [[A1, C1]] });
  await handleTelegramUpdate(deps as never, photoMessage({ media_group_id: "album-1" }));
  await handleTelegramUpdate(deps as never, {
    message: { chat: { id: 555, type: "private" }, from: { id: 555 }, media_group_id: "album-1", photo: [{ file_id: "photo-2", file_unique_id: "u-2", file_size: 3 }] },
  });
  const prompts = tg.calls.filter((c) => c.method === "sendMessage");
  assertEquals(prompts.length, 1, "only the first album item asks");
  const data = String(((prompts[0].body.reply_markup as Row).inline_keyboard as Array<Array<Row>>)[0][0].callback_data);
  await handleTelegramUpdate(deps as never, callback(data));
  const meta = (db.rpcCalls.find((c) => c.name === "academy_assignment_written_command")!.args.p_payload as Row).metadata as Row;
  assert(meta.storage);
  assertEquals((meta.pages as Row[]).length, 1);
  assertMatch(tg.messages().at(-1)!, /Received 2 files/);
});

Deno.test("work with no attempts left is not offered", async () => {
  const { deps, tg, db } = setup({
    centres: [[A1, C1]],
    submissions: [{ id: "s-1", assignment_id: H1, contact_id: C1, attempt_number: 1, status: "graded" }],
  });
  await handleTelegramUpdate(deps as never, photoMessage());
  assertMatch(tg.messages()[0], /no open homework/);
  assertEquals(db.rpcCalls.filter((c) => c.name === "academy_assignment_written_command").length, 0);
});

Deno.test("the same photo from another learner is flagged for the teacher", async () => {
  const { deps, db } = setup({
    centres: [[A1, C1]],
    submissions: [{ id: "other", assignment_id: H1, contact_id: "someone-else", attempt_number: 1, status: "submitted", metadata: { storage: { telegram_file_unique_id: "u-big" } } }],
  });
  await handleTelegramUpdate(deps as never, photoMessage());
  const signals = db.table("academy_homework_integrity_signals");
  assertEquals(signals.length, 1);
  assertEquals(signals[0].signal, "duplicate_media");
  assertEquals(signals[0].severity, "review");
});

Deno.test("viewing a task focuses the next hand-in on it", async () => {
  const { deps, db, tg } = setup();
  await handleTelegramUpdate(deps as never, callback(`hw:v:${H2}`));
  assertMatch(tg.messages()[0], /Worksheet 3/);
  assertEquals(db.table("academy_homework_events").filter((e) => e.event === "opened").length, 1);
  await handleTelegramUpdate(deps as never, { message: { chat: { id: 555, type: "private" }, from: { id: 555 }, text: "Answers: 1b 2c 3a" } });
  const written = db.rpcCalls.filter((c) => c.name === "academy_assignment_written_command");
  assertEquals(written.length, 1);
  assertEquals(written[0].args.p_assignment, H2);
  assertEquals(((written[0].args.p_payload as Row).metadata as Row).response_kind, "text");
  assertEquals(db.table("academy_homework_integrity_signals")[0].signal, "untimed_source");
});

Deno.test("group chats are ignored", async () => {
  const { deps, tg } = setup();
  const result = await handleTelegramUpdate(deps as never, { message: { chat: { id: -100, type: "group" }, from: { id: 555 }, text: "hi" } });
  assertEquals(result, { handled: false });
  assertEquals(tg.calls.length, 0);
});

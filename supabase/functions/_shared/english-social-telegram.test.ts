import { assert, assertEquals, assertStringIncludes, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import type { DuelView } from "./english-duel.ts";
import {
  duelAnswerData,
  duelAnsweredText,
  duelCreatedReply,
  duelQuestionReply,
  duelResultReply,
  escapeTelegramHtml,
  parentStopData,
  parentSubscribedReply,
  parseSocialCallback,
  parseSocialStart,
  socialLocale,
  socialText,
} from "./english-social-telegram.ts";

const links = { webUrl: "https://english.schood.online/duel/ABCDEFGHJK", botInviteUrl: "https://t.me/schoodstudentbot?start=duel_ABCDEFGHJK", miniAppRoute: "view=english&duel=ABCDEFGHJK" };

const view = (patch: Partial<DuelView> = {}): DuelView => ({
  code: "ABCDEFGHJK",
  status: "finished",
  role: "creator",
  server_now: "2026-10-26T10:00:00Z",
  invite_expires_at: "2026-10-27T10:00:00Z",
  play_expires_at: "2026-10-28T10:00:00Z",
  opponent_name: "<b>Ali</b>",
  opponent_joined: true,
  me: { started: true, finished: true, deadline_at: null, seconds_left: 0, answered: 10, correct: 8, outcome: "win", xp: 10 },
  question: null,
  opponent: { started: true, finished: true, correct: 6, answered: 10, outcome: "loss" },
  review: [],
  can_rematch: true,
  rematch_code: null,
  ...patch,
});

Deno.test("HTML is escaped in every learner-supplied value", () => {
  assertEquals(escapeTelegramHtml(`<a href="x">&</a>`), "&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;");
  const text = socialText("en", "ready", { name: "<script>" });
  assertStringIncludes(text, "&lt;script&gt;");
  assert(!text.includes("<script>"));
  const result = duelResultReply("en", view(), links);
  assertStringIncludes(result.text, "&lt;b&gt;Ali&lt;/b&gt;");
});

Deno.test("callback data stays under 64 bytes and round-trips", () => {
  const data = duelAnswerData("ABCDEFGHJK", 9, 3);
  assert(new TextEncoder().encode(data).length <= 64);
  assertEquals(parseSocialCallback(data), { kind: "duel_answer", code: "ABCDEFGHJK", index: 9, choice: 3 });
  assertEquals(parseSocialCallback("edu:s:ABCDEFGHJK"), { kind: "duel_start", code: "ABCDEFGHJK" });
  assertEquals(parseSocialCallback("edu:r:ABCDEFGHJK"), { kind: "duel_rematch", code: "ABCDEFGHJK" });
  const watcher = "4b1a8a8e-0f43-4c9e-9a59-7b7a5a0b1c2d";
  assertEquals(parseSocialCallback(parentStopData(watcher)), { kind: "parent_stop", watcher_id: watcher });
  // Other features' buttons and tampered data are not ours.
  assertEquals(parseSocialCallback("enq:abcdefghij:1"), null);
  assertEquals(parseSocialCallback("edu:a:ABCDEFGHIO:1:1"), null);
  assertEquals(parseSocialCallback("edu:a:ABCDEFGHJK:10:1"), null);
  assertThrows(() => duelAnswerData("bad", 0, 0));
});

Deno.test("start parameters: duel invites and parent links only", () => {
  assertEquals(parseSocialStart("duel_abcdefghjk"), { kind: "duel", code: "ABCDEFGHJK" });
  const token = "A".repeat(30) + "_-";
  assertEquals(parseSocialStart(`pl_${token}`), { kind: "parent", token });
  // Telegram account-link tokens keep going to the existing handler.
  assertEquals(parseSocialStart("3f2a9c"), null);
  assertEquals(parseSocialStart("pl_short"), null);
  assertEquals(parseSocialStart("duel_"), null);
});

Deno.test("Telegram locale falls back to English", () => {
  assertEquals(socialLocale("ru-RU"), "ru");
  assertEquals(socialLocale("uz"), "uz");
  assertEquals(socialLocale("de"), "en");
  assertEquals(socialLocale(undefined), "en");
});

Deno.test("question messages show the meaning and one button per word", () => {
  const reply = duelQuestionReply("en", "ABCDEFGHJK", { index: 2, total: 10, prompt: "a <small> house", options: ["hut", "tower", "castle", "barn"] }, 41);
  assertStringIncludes(reply.text, "<b>3/10</b>");
  assertStringIncludes(reply.text, "41s");
  assertStringIncludes(reply.text, "a &lt;small&gt; house");
  assertEquals(reply.buttons.length, 4);
  assertEquals(reply.buttons[1]![0], { text: "tower", callback_data: "edu:a:ABCDEFGHJK:2:1" });
  const answered = duelAnsweredText("ru", { index: 2, total: 10, prompt: "x", options: ["hut", "tower", "castle", "barn"] }, false, 0);
  assertStringIncludes(answered, "Правильно: <b>hut</b>");
});

Deno.test("results: win, waiting, rematch and the invite share link", () => {
  const win = duelResultReply("uz", view(), links);
  assertStringIncludes(win.text, "Siz yutdingiz");
  assertStringIncludes(win.text, "+10 XP");
  assertEquals(win.buttons[0]![0]!.callback_data, "edu:r:ABCDEFGHJK");
  const waiting = duelResultReply("en", view({ status: "active", me: { ...view().me, outcome: null, correct: 7 } }), links);
  assertStringIncludes(waiting.text, "7 of 10");
  assertEquals(waiting.buttons, []);
  const created = duelCreatedReply("en", links);
  assert(created.buttons[0]![0]!.url!.startsWith("https://t.me/share/url?url=https%3A%2F%2Ft.me%2Fschoodstudentbot%3Fstart%3Dduel_ABCDEFGHJK"));
  assertEquals(created.buttons[1]![0]!.web_app_route, "view=english&duel=ABCDEFGHJK");
});

Deno.test("parent subscription names the learner by first name, escaped", () => {
  const reply = parentSubscribedReply("ru", { firstName: "Aziza & co", watcherId: "4b1a8a8e-0f43-4c9e-9a59-7b7a5a0b1c2d", pageUrl: "https://english.schood.online/p/x", again: false });
  assertStringIncludes(reply.text, "Aziza &amp; co");
  assertEquals(reply.buttons[1]![0]!.callback_data, "epl:stop:4b1a8a8e-0f43-4c9e-9a59-7b7a5a0b1c2d");
});

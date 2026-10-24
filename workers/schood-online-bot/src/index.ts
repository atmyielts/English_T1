/** @schoodonlinebot: focused student and academy acquisition journeys. */
import { englishCheckMenuRow, routeEnglishCheck } from "./english-check.ts";

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  WEBHOOK_SECRET_PREVIOUS?: string;
  SUPABASE_URL: string;
  TELEGRAM_INTERNAL_SECRET: string;
  SITE_URL: string;
  DISCOVER_APP_URL: string;
  STUDENT_BOT_URL: string;
  TELEGRAM_BOT_NAME?: string;
}

type Button = { text: string; url?: string; callback_data?: string; web_app?: { url: string } };
type Message = { chat?: { id?: number | string }; from?: { id?: number; first_name?: string; username?: string }; text?: string };
type Callback = { id: string; from: { id: number; first_name?: string; username?: string }; data?: string; message?: { chat?: { id?: number | string } } };
type ApiResult = Record<string, any>;

const escapeHtml = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const markup = (rows: Button[][]) => ({ inline_keyboard: rows });
const tg = async (env: Env, method: string, body: unknown) => {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error(JSON.stringify({ event: "telegram_api_failed", method, status: response.status }));
    if (response.status === 429 || response.status >= 500) {
      throw new Error(`Telegram ${method} retryable failure (${response.status})`);
    }
  }
  return payload;
};
const send = (env: Env, chatId: number | string, text: string, rows?: Button[][]) => tg(env, "sendMessage", {
  chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: rows ? markup(rows) : undefined,
});
const answer = (env: Env, id: string, text?: string) => tg(env, "answerCallbackQuery", { callback_query_id: id, text });
const edge = async (env: Env, body: Record<string, unknown>): Promise<ApiResult> => {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, "")}/functions/v1/telegram-public`, {
    method: "POST",
    headers: { "x-worker-secret": env.TELEGRAM_INTERNAL_SECRET, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 409) throw new Error(String(payload.error ?? `Edge HTTP ${response.status}`));
  return { ...payload, http_status: response.status };
};

const validWebhookSecret = (env: Env, supplied: string | null): boolean =>
  Boolean(supplied && (supplied === env.WEBHOOK_SECRET || supplied === env.WEBHOOK_SECRET_PREVIOUS));

const authUrl = (env: Env, mode: 'signin' | 'signup'): string => {
  const url = new URL('/auth', env.SITE_URL);
  url.searchParams.set('provider', 'telegram');
  url.searchParams.set('mode', mode);
  url.searchParams.set('returnTo', '/account');
  return url.toString();
};

const choiceRows = (): Button[][] => [
  [{ text: "Estimate my IELTS level", callback_data: "student_begin" }],
  [{ text: "I run an academy", callback_data: "academy_begin" }],
  englishCheckMenuRow(),
];
const focusedStart = (name?: string) => `<b>${name ? `${escapeHtml(name)}, choose your first result.` : "Choose your first result."}</b>\n\nStudents get a short, real vocabulary check and a personalized 7-day starter plan.\n\nAcademies get a focused operations consultation.`;

const renderStep = async (env: Env, chatId: number | string, result: ApiResult) => {
  const step = String(result.step ?? result.last_step ?? "started");
  const state = result.state ?? {};
  if (step === "student_goal") return send(env, chatId, "<b>What IELTS score are you targeting?</b>", [[
    { text: "6.5", callback_data: "goal_6_5" }, { text: "7.0", callback_data: "goal_7_0" }, { text: "7.5+", callback_data: "goal_7_5" },
  ]]);
  if (step === "student_exam_date") return send(env, chatId, "<b>When is your exam?</b>\n\nThis keeps the plan practical.", [[
    { text: "Within 30 days", callback_data: "exam_30" }, { text: "1-3 months", callback_data: "exam_90" },
  ], [{ text: "Later / not booked", callback_data: "exam_later" }]]);
  const questions: Record<string, { prompt: string; answers: string[] }> = {
    diagnostic_q1: { prompt: "1/3 · What does <b>assess</b> mean?", answers: ["to evaluate", "to avoid", "to repeat"] },
    diagnostic_q2: { prompt: "2/3 · What does <b>relevant</b> mean?", answers: ["connected to the topic", "very expensive", "difficult to hear"] },
    diagnostic_q3: { prompt: "3/3 · What does <b>interpret</b> mean?", answers: ["to explain meaning", "to memorize spelling", "to shorten a text"] },
  };
  if (questions[step]) {
    const number = step.slice(-1);
    return send(env, chatId, `<b>Quick vocabulary check</b>\n\n${questions[step].prompt}`, questions[step].answers.map((label, index) => [{ text: label, callback_data: `answer_q${number}_${index}` }]));
  }
  if (step === "diagnostic_result") {
    const resultData = state.result ?? {};
    const missed = Array.isArray(resultData.missedWords) && resultData.missedWords.length ? `\nReview first: <b>${resultData.missedWords.map(escapeHtml).join(", ")}</b>.` : "\nYou got every item right.";
    const session = encodeURIComponent(String(result.session_id ?? ""));
    return send(env, chatId,
      `<b>Your starter result: ${Number(resultData.correct ?? 0)}/3</b>\n\nTarget: IELTS ${escapeHtml(state.target_score ?? "not set")}. ${missed}\n\n<b>Your 7-day plan</b>\nAlternate vocabulary review and reading-in-context for ${Number(resultData.plan?.[0]?.minutes ?? 15)} minutes a day.\n\nThis is a vocabulary readiness check, not an IELTS band prediction. Link an account to save the plan and continue tomorrow.`,
      [[{ text: "Save my plan", url: `${env.SITE_URL}/account?telegram=link&acquisition_session_id=${session}` }], [{ text: "Start vocabulary practice", url: `${env.SITE_URL}/vocab-drill?source=telegram&session=${session}` }]],
    );
  }
  if (step === "academy_name") return send(env, chatId, "<b>What is your academy or education center called?</b>\n\nReply with the name. Send /cancel to stop.");
  if (step === "academy_contact") return send(env, chatId, "<b>Where should our academy specialist contact you?</b>\n\nReply with a phone number, email, or @Telegram username.");
  if (step === "academy_students") return send(env, chatId, "<b>How many students do you manage?</b>", [
    [{ text: "Under 50", callback_data: "students_under50" }, { text: "50-199", callback_data: "students_50_199" }],
    [{ text: "200-499", callback_data: "students_200_499" }, { text: "500+", callback_data: "students_500plus" }],
  ]);
  if (step === "academy_capability") return send(env, chatId, "<b>What needs fixing first?</b>", [
    [{ text: "Attendance", callback_data: "cap_attendance" }, { text: "Homework", callback_data: "cap_homework" }],
    [{ text: "Payments", callback_data: "cap_payments" }, { text: "All operations", callback_data: "cap_all" }],
  ]);
  if (step === "academy_preference") return send(env, chatId, "<b>How do you prefer us to follow up?</b>", [[
    { text: "Telegram", callback_data: "contact_telegram" }, { text: "Phone", callback_data: "contact_phone" }, { text: "Email", callback_data: "contact_email" },
  ]]);
  if (step === "academy_lead_ready") return send(env, chatId,
    `<b>Your academy request is in.</b>\n\nWe recorded ${escapeHtml(state.academy_name)} and your priority: <b>${escapeHtml(state.capability)}</b>. Our response target is within 4 business hours.`,
    [[{ text: "See Academy OS", url: `${env.SITE_URL}/academy?source=telegram` }], [{ text: "Book a demo", url: `${env.SITE_URL}/contact?topic=academy-demo` }]],
  );
  if (step === "canceled") return send(env, chatId, "Journey canceled. Send /start whenever you want to continue.");
  return send(env, chatId, focusedStart(), choiceRows());
};

const start = async (env: Env, updateId: number, message: Message, payload: string) => {
  const telegramUserId = message.from?.id ?? message.chat?.id;
  const chatId = message.chat?.id;
  if (!telegramUserId || !chatId) return;
  const session = await edge(env, { action: "session_start", bot_name: "schoodonlinebot", telegram_user_id: telegramUserId, payload, update_id: updateId });
  if (session.linked_user && session.funnel !== "academy") {
    await send(env, chatId, `<b>Welcome back, ${escapeHtml(session.linked_user.full_name ?? "student")}.</b>\n\nYour private assignments, learning queue, results, and payments are in the student bot.`, [[{ text: "Open today's work", url: env.STUDENT_BOT_URL }]]);
    return;
  }
  if (session.last_step !== "started") { await renderStep(env, chatId, session); return; }
  if (session.funnel === "academy") {
    await send(env, chatId, "<b>Run your academy with Schood + Telegram.</b>\n\nAttendance, homework, teachers, payments, reminders, and reports — with the urgent work surfaced in Telegram.", [[{ text: "Start academy consultation", callback_data: "academy_begin" }], [{ text: "Book demo directly", url: `${env.SITE_URL}/contact?topic=academy-demo` }]]);
  } else if (session.funnel === "student_ielts" || session.funnel === "course" || session.funnel === "referral") {
    await send(env, chatId, "<b>Let's find your strongest next study step.</b>\n\nStart with a 3-question vocabulary check. You get a grounded 7-day starter plan — no fake band score.", [[{ text: "Start 3-minute check", callback_data: "student_begin" }]]);
  } else {
    await send(env, chatId, focusedStart(message.from?.first_name), choiceRows());
  }
};

const handleMessage = async (env: Env, updateId: number, message: Message) => {
  const chatId = message.chat?.id;
  const telegramUserId = message.from?.id ?? chatId;
  if (!chatId || !telegramUserId) return;
  const raw = String(message.text ?? "").trim();
  const [rawCommand, ...args] = raw.split(/\s+/);
  const command = rawCommand.replace(/@\w+$/, "").toLowerCase();
  if (command === "/start") return start(env, updateId, message, args[0] ?? "");
  if (command === "/login") return send(env, chatId,
    "<b>Sign in to Schood</b>\n\nOpen the secure Schood page and choose Telegram. If this is your first time, use /signup so your recovery email is verified first.",
    [[{ text: "Sign in with Telegram", url: authUrl(env, 'signin') }], [{ text: "Create an account", url: authUrl(env, 'signup') }]],
  );
  if (command === "/signup") return send(env, chatId,
    "<b>Create your Schood account</b>\n\nSchood verifies your email first, collects a phone number, and then securely links this Telegram identity. This prevents duplicate accounts.",
    [[{ text: "Sign up with Telegram", url: authUrl(env, 'signup') }], [{ text: "I already have an account", url: authUrl(env, 'signin') }]],
  );
  if (command === "/ielts") return start(env, updateId, message, "ielts_organic_telegram");
  if (command === "/academy") return start(env, updateId, message, "academy_organic_telegram");
  if (command === "/cancel") {
    const result = await edge(env, { action: "journey_step", bot_name: "schoodonlinebot", telegram_user_id: telegramUserId, step_action: "cancel", update_id: updateId });
    return renderStep(env, chatId, result);
  }
  if (command === "/help") return send(env, chatId, "<b>Schood Telegram</b>\n\n/login — sign in with Telegram\n/signup — create an email-recoverable account\n/ielts — get a starter study plan\n/check — check my English (rough level and fixes)\n/academy — academy operations consultation\n/student — open private student work\n/cancel — stop the current journey", [[{ text: "Sign in to Schood", url: authUrl(env, 'signin') }], [{ text: "Private student bot", url: env.STUDENT_BOT_URL }]]);
  if (command === "/student") return send(env, chatId, "Open your private student command center.", [[{ text: "Open student bot", url: env.STUDENT_BOT_URL }]]);
  if (!raw) return;
  try {
    const result = await edge(env, {
      action: "journey_step", bot_name: "schoodonlinebot", telegram_user_id: telegramUserId,
      step_action: "input", input: raw, update_id: updateId,
      first_name: message.from?.first_name, username: message.from?.username,
    });
    return renderStep(env, chatId, result);
  } catch {
    return send(env, chatId, "Send /start to choose a focused student or academy journey.", choiceRows());
  }
};

const handleCallback = async (env: Env, updateId: number, query: Callback) => {
  await answer(env, query.id);
  const chatId = query.message?.chat?.id ?? query.from.id;
  const result = await edge(env, {
    action: "journey_step", bot_name: "schoodonlinebot", telegram_user_id: query.from.id,
    step_action: String(query.data ?? ""), update_id: updateId,
    first_name: query.from.first_name, username: query.from.username,
  });
  await renderStep(env, chatId, result);
};

const processUpdate = async (env: Env, update: Record<string, any>): Promise<"completed" | "duplicate" | "busy"> => {
  const updateId = Number(update.update_id);
  const from = update.callback_query?.from ?? update.message?.from;
  const claim = await edge(env, {
    action: "claim_update", bot_name: "schoodonlinebot", update_id: updateId,
    telegram_user_id: from?.id, update_kind: update.callback_query ? "callback_query" : update.message ? "message" : "other",
  });
  if (claim.outcome === "completed") return "duplicate";
  if (claim.outcome === "busy") return "busy";
  const claimToken = String(claim.claim_token ?? "");
  if (!claimToken) throw new Error("Telegram update claim token missing");
  try {
    // === "Check my English" (./english-check.ts) runs first; other updates are untouched ===
    const englishCheck = { edge: (body: Record<string, unknown>) => edge(env, body), tg: (method: string, body: unknown) => tg(env, method, body) };
    if (await routeEnglishCheck(englishCheck, updateId, update)) { /* answered */ }
    else if (update.callback_query) await handleCallback(env, updateId, update.callback_query as Callback);
    else if (update.message) await handleMessage(env, updateId, update.message as Message);
    const completed = await edge(env, { action: "complete_update", bot_name: "schoodonlinebot", update_id: updateId, claim_token: claimToken });
    if (!completed.ok) throw new Error("Telegram update completion was rejected");
    return "completed";
  } catch (error) {
    await edge(env, { action: "complete_update", bot_name: "schoodonlinebot", update_id: updateId, claim_token: claimToken, failed: true, error: error instanceof Error ? error.message : "unknown" }).catch(() => {});
    throw error;
  }
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/health") return new Response("Schood public acquisition bot is running");
    if (url.pathname !== "/webhook" || request.method !== "POST") return new Response("Not found", { status: 404 });
    if (!env.WEBHOOK_SECRET || !validWebhookSecret(env, request.headers.get("X-Telegram-Bot-Api-Secret-Token"))) return new Response("Unauthorized", { status: 401 });
    let update: Record<string, any>;
    try { update = await request.json(); } catch { return new Response("Bad request", { status: 400 }); }
    if (!Number.isSafeInteger(Number(update.update_id))) return new Response("Bad update", { status: 400 });
    try {
      const outcome = await processUpdate(env, update);
      return new Response(outcome === "busy" ? "Retry later" : "OK", { status: outcome === "busy" ? 503 : 200 });
    } catch (error) {
      console.error(JSON.stringify({ event: "telegram_update_failed", update_id: update.update_id, reason: error instanceof Error ? error.message : "unknown" }));
      return new Response("Retry later", { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;

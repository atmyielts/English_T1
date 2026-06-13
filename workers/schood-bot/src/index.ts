/**
 * Schood Telegram Bot - Cloudflare Worker.
 *
 * Handles Telegram webhook updates and points linked learners into the
 * Schood Telegram Mini App.
 */

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_BOT_NAME: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  WEBHOOK_SECRET: string;
  SITE_URL: string;
  WEB_APP_URL?: string;
}

type LinkedUser = { id: string; email: string; name: string };

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const webAppUrl = (env: Env): string => env.WEB_APP_URL || `${env.SITE_URL.replace(/\/$/, "")}/telegram`;

const tg = (token: string, method: string, body?: unknown) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());

const webAppMarkup = (env: Env, label = "Open Schood") => ({
  inline_keyboard: [[{ text: label, web_app: { url: webAppUrl(env) } }]],
});

const send = (env: Env, chatId: number | string, text: string, extra?: Record<string, unknown>) =>
  tg(env.TELEGRAM_BOT_TOKEN, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...extra,
  });

const answerCallback = (env: Env, callbackQueryId: string, text?: string) =>
  tg(env.TELEGRAM_BOT_TOKEN, "answerCallbackQuery", { callback_query_id: callbackQueryId, text });

const sbGet = async (env: Env, table: string, params: Record<string, string>) => {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      Accept: "application/json",
    },
  });
  return res.ok ? res.json() : null;
};

const sbPatch = async (env: Env, table: string, params: Record<string, string>, body: unknown) => {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    method: "PATCH",
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  return res.ok;
};

const sbEdge = async (env: Env, fn: string, body: unknown) => {
  const res = await fetch(`${env.SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok ? res.json() : null;
};

const getUser = async (env: Env, telegramUserId: number): Promise<LinkedUser | null> => {
  const rows = await sbGet(env, "users", {
    telegram_chat_id: `eq.${telegramUserId}`,
    select: "id,email,full_name",
    limit: "1",
  });
  if (!rows?.length) return null;
  const u = rows[0];
  return {
    id: String(u.id),
    email: String(u.email ?? ""),
    name: String(u.full_name || u.email?.split("@")[0] || "Student"),
  };
};

const sendAppEntry = async (env: Env, chatId: number, user: LinkedUser | null, context = "dashboard") => {
  if (!user) {
    await send(
      env,
      chatId,
      `Your Telegram is not linked to Schood yet.\n\nOpen Schood from the button below, sign in once, then use <b>Account -> Link Telegram</b>. After that, come back here and tap Open Schood again.`,
      { reply_markup: webAppMarkup(env, "Open Schood Mini App") },
    );
    return;
  }

  const title = context === "drill" ? "Practice from Telegram" : context === "assignments" ? "Assignments in Telegram" : "Schood in Telegram";
  await send(
    env,
    chatId,
    `<b>${title}</b>\n\nOpen your student command center for today's work, assignments, grades, payments, vocab drills, certificates, and support.`,
    { reply_markup: webAppMarkup(env) },
  );
};

const handleStart = async (env: Env, chatId: number, from: { id?: number; first_name?: string }, param: string) => {
  if (param) {
    const result = await sbEdge(env, "telegram-link", { action: "validate", token: param, chat_id: String(from.id ?? chatId) });
    if (result?.ok) {
      await send(
        env,
        chatId,
        `<b>Account linked.</b>\n\nWelcome to Schood, <b>${escapeHtml(result.name)}</b>.\n\nUse the button below to open your Telegram student command center.`,
        { reply_markup: webAppMarkup(env, "Open Schood") },
      );
    } else {
      await send(
        env,
        chatId,
        `<b>Link failed.</b>\n\n${escapeHtml(result?.error || "Invalid or expired link.")}\n\nGenerate a new link from your Schood account.`,
      );
    }
    return;
  }

  const user = await getUser(env, from.id ?? chatId);
  if (user) {
    await send(
      env,
      chatId,
      `Welcome back, <b>${escapeHtml(user.name)}</b>.\n\nOpen Schood here or type /help for commands.`,
      { reply_markup: webAppMarkup(env) },
    );
    return;
  }

  await send(
    env,
    chatId,
    `Hi ${escapeHtml(from.first_name ?? "there")}.\n\nI am the Schood bot. Link your account from Schood Account -> Link Telegram, then come back here to use the student command center.`,
  );
};

const handleHelp = async (env: Env, chatId: number, user: LinkedUser | null) => {
  const msg = `<b>Schood Bot Commands</b>\n\n`
    + (user ? "" : `<i>Link your Schood account first with /start.</i>\n\n`)
    + `/app - Open the Schood Telegram app\n`
    + `/dashboard - Open your student command center\n`
    + `/results - Recent scores\n`
    + `/assignments - Assignments due this week\n`
    + `/schedule - Weekly class timetable\n`
    + `/cert - Latest certificates\n`
    + `/drill - Vocabulary flashcards\n`
    + `/me - Profile and active plans\n`
    + `/unlink - Disconnect Telegram\n`
    + `/help - This message`;
  await send(env, chatId, msg, user ? { reply_markup: webAppMarkup(env) } : undefined);
};

const handleMe = async (env: Env, chatId: number, user: LinkedUser) => {
  const entitlements = await sbGet(env, "entitlements", {
    user_id: `eq.${user.id}`,
    is_active: "eq.true",
    select: "resource_id,ends_at,products(name)",
    limit: "5",
  });
  const lines = [`<b>${escapeHtml(user.name)}</b>`, escapeHtml(user.email), ""];
  if (entitlements?.length) {
    lines.push("<b>Active access:</b>");
    for (const e of entitlements) {
      const product = e.products?.name ?? e.resource_id;
      const expiry = e.ends_at ? ` until ${new Date(e.ends_at).toLocaleDateString()}` : " lifetime";
      lines.push(`- ${escapeHtml(product)} (${escapeHtml(expiry)})`);
    }
  } else {
    lines.push(`No active plans. Visit <a href="${escapeHtml(env.SITE_URL)}/pricing">pricing</a>.`);
  }
  await send(env, chatId, lines.join("\n"), { reply_markup: webAppMarkup(env) });
};

const handleResults = async (env: Env, chatId: number, user: LinkedUser) => {
  const outcomes = await sbGet(env, "exam_outcomes", {
    user_id: `eq.${user.id}`,
    status: "eq.completed",
    select: "overall_band,overall_score,computed_at,products(name)",
    order: "computed_at.desc",
    limit: "5",
  });
  if (!outcomes?.length) {
    await send(env, chatId, `No completed exams yet.\n\nOpen Schood to start practice.`, { reply_markup: webAppMarkup(env) });
    return;
  }
  const lines = ["<b>Your recent scores</b>", ""];
  for (const o of outcomes) {
    const score = o.overall_band ?? o.overall_score ?? "-";
    const date = o.computed_at ? new Date(o.computed_at).toLocaleDateString() : "";
    lines.push(`- <b>${escapeHtml(o.products?.name ?? "Exam")}</b>: ${escapeHtml(score)} ${escapeHtml(date)}`);
  }
  await send(env, chatId, lines.join("\n"), { reply_markup: webAppMarkup(env) });
};

const handleAssignments = async (env: Env, chatId: number, user: LinkedUser) => {
  const contacts = await sbGet(env, "academy_contacts", { user_id: `eq.${user.id}`, select: "id,academy_id", limit: "10" });
  if (!contacts?.length) {
    await send(env, chatId, "You are not enrolled in any academy classrooms yet.", { reply_markup: webAppMarkup(env) });
    return;
  }
  const contactIds = contacts.map((c: any) => c.id).filter(Boolean);
  const subs = await sbGet(env, "academy_submissions", {
    contact_id: `in.(${contactIds.join(",")})`,
    status: "in.(missing,submitted)",
    select: "assignment_id,status,academy_assignments(title,due_at,classroom_id)",
    limit: "10",
  });
  if (!subs?.length) {
    await send(env, chatId, "No pending assignments right now.", { reply_markup: webAppMarkup(env, "Open assignments") });
    return;
  }
  const lines = ["<b>Your assignments</b>", ""];
  for (const s of subs) {
    const a = s.academy_assignments;
    if (!a) continue;
    const due = a.due_at ? ` due ${new Date(a.due_at).toLocaleDateString()}` : "";
    lines.push(`- ${escapeHtml(a.title)}${escapeHtml(due)} (${escapeHtml(s.status)})`);
  }
  await send(env, chatId, lines.join("\n"), { reply_markup: webAppMarkup(env, "Open assignments") });
};

const handleSchedule = async (env: Env, chatId: number, user: LinkedUser) => {
  const contacts = await sbGet(env, "academy_contacts", { user_id: `eq.${user.id}`, select: "id", limit: "10" });
  if (!contacts?.length) {
    await send(env, chatId, "No class schedule found.", { reply_markup: webAppMarkup(env) });
    return;
  }
  const contactIds = contacts.map((c: any) => c.id).filter(Boolean);
  const memberships = await sbGet(env, "academy_classroom_memberships", {
    contact_id: `in.(${contactIds.join(",")})`,
    role: "in.(student,observer)",
    select: "classroom_id",
    limit: "20",
  });
  const classroomIds = [...new Set((memberships ?? []).map((m: any) => m.classroom_id).filter(Boolean))];
  if (!classroomIds.length) {
    await send(env, chatId, "You are not in any classrooms yet.", { reply_markup: webAppMarkup(env) });
    return;
  }
  const schedules = await sbGet(env, "academy_classroom_schedules", {
    classroom_id: `in.(${classroomIds.join(",")})`,
    select: "day_of_week,start_time,end_time,label,academy_classrooms(name)",
    order: "day_of_week.asc,start_time.asc",
    limit: "20",
  });
  if (!schedules?.length) {
    await send(env, chatId, "Your teacher has not set a schedule yet.", { reply_markup: webAppMarkup(env) });
    return;
  }
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const lines = ["<b>Your weekly schedule</b>", ""];
  for (const s of schedules) {
    const day = days[s.day_of_week] ?? String(s.day_of_week);
    const time = `${s.start_time}${s.end_time ? `-${s.end_time}` : ""}`;
    const name = s.academy_classrooms?.name ?? "Class";
    const label = s.label ? ` (${s.label})` : "";
    lines.push(`- <b>${escapeHtml(day)}</b> ${escapeHtml(time)} - ${escapeHtml(name)}${escapeHtml(label)}`);
  }
  await send(env, chatId, lines.join("\n"), { reply_markup: webAppMarkup(env, "Open schedule") });
};

const handleCert = async (env: Env, chatId: number, user: LinkedUser) => {
  const certs = await sbGet(env, "issued_certificates", {
    user_id: `eq.${user.id}`,
    is_public: "eq.true",
    select: "public_token,exam_type,overall_band,overall_score,exam_date",
    order: "issued_at.desc",
    limit: "3",
  });
  if (!certs?.length) {
    await send(env, chatId, "No certificates yet.", { reply_markup: webAppMarkup(env) });
    return;
  }
  const lines = ["<b>Your certificates</b>", ""];
  for (const c of certs) {
    const score = c.overall_band ?? c.overall_score ?? "-";
    const url = `${env.SITE_URL}/certificate?token=${c.public_token}`;
    lines.push(`- <b>${escapeHtml(String(c.exam_type ?? "").toUpperCase())}</b> ${escapeHtml(score)} - <a href="${escapeHtml(url)}">View</a>`);
  }
  await send(env, chatId, lines.join("\n"), { reply_markup: webAppMarkup(env) });
};

const getNextDrillCard = async (env: Env, userId: string) => {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await sbGet(env, "vocab_drill_cards", {
    user_id: `eq.${userId}`,
    next_review: `lte.${today}`,
    select: "id,word,definition,example",
    order: "next_review.asc",
    limit: "1",
  });
  return rows?.[0] ?? null;
};

const handleDrill = async (env: Env, chatId: number, user: LinkedUser) => {
  const card = await getNextDrillCard(env, user.id);
  if (!card) {
    await send(env, chatId, "No vocabulary cards are due right now.", { reply_markup: webAppMarkup(env, "Open practice") });
    return;
  }
  await send(
    env,
    chatId,
    `<b>Vocab drill</b>\n\n<b>${escapeHtml(card.word)}</b>\n\nUse the Mini App for reveal, rating, and next card.`,
    { reply_markup: webAppMarkup(env, "Open drill") },
  );
};

const handleUnlink = async (env: Env, chatId: number) => {
  await sbEdge(env, "telegram-link", { action: "unlink", chat_id: String(chatId) });
  await send(env, chatId, "Your Telegram has been unlinked from Schood. You can re-link any time from your Schood account.");
};

const handleCallback = async (env: Env, query: { id: string; from: { id: number }; data?: string; message?: { chat: { id: number } } }) => {
  await answerCallback(env, query.id);
  const chatId = query.message?.chat.id ?? query.from.id;
  const user = await getUser(env, query.from.id);
  await sendAppEntry(env, chatId, user);
};

const handleUpdate = async (env: Env, update: Record<string, unknown>) => {
  if (update.callback_query) {
    await handleCallback(env, update.callback_query as any);
    return;
  }

  const msg = update.message as Record<string, unknown> | undefined;
  if (!msg) return;
  const chatId = (msg.chat as any)?.id as number;
  const from = (msg.from ?? {}) as { id: number; first_name?: string };
  const telegramUserId = from.id || chatId;
  const text = String(msg.text ?? "").trim();
  if (!chatId || !text) return;

  const [cmd, ...args] = text.split(/\s+/);
  const command = cmd.replace(/@\w+$/, "").toLowerCase();
  const param = args.join(" ");

  if (command === "/start") { await handleStart(env, chatId, from, param); return; }
  if (command === "/help") { await handleHelp(env, chatId, await getUser(env, telegramUserId)); return; }
  if (command === "/unlink") { await handleUnlink(env, telegramUserId); return; }

  const user = await getUser(env, telegramUserId);
  if (command === "/app" || command === "/dashboard") { await sendAppEntry(env, chatId, user); return; }

  if (!user) {
    await send(
      env,
      chatId,
      `Your Telegram is not linked to Schood yet.\n\nOpen the Schood Mini App below, sign in once, then use <b>Account -> Link Telegram</b>. After linking, commands like /assignments and /drill will work here.`,
      { reply_markup: webAppMarkup(env, "Open Schood Mini App") },
    );
    return;
  }

  if (command === "/me") { await handleMe(env, chatId, user); return; }
  if (command === "/results") { await handleResults(env, chatId, user); return; }
  if (command === "/assignments") { await handleAssignments(env, chatId, user); return; }
  if (command === "/schedule") { await handleSchedule(env, chatId, user); return; }
  if (command === "/cert") { await handleCert(env, chatId, user); return; }
  if (command === "/drill") { await handleDrill(env, chatId, user); return; }

  await send(env, chatId, "Unknown command. Type /help to see what I can do.", { reply_markup: webAppMarkup(env) });
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/") return new Response("Schood Bot is running", { status: 200 });

    if (url.pathname === "/webhook" && request.method === "POST") {
      const receivedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
      if (env.WEBHOOK_SECRET && receivedSecret !== env.WEBHOOK_SECRET) {
        return new Response("Unauthorized", { status: 401 });
      }

      let update: Record<string, unknown>;
      try {
        update = await request.json();
      } catch {
        return new Response("Bad request", { status: 400 });
      }

      ctx.waitUntil(handleUpdate(env, update).catch((err) => {
        console.error("handleUpdate error:", err);
      }));

      return new Response("OK", { status: 200 });
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

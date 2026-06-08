/**
 * Schood Telegram Bot — Cloudflare Worker
 *
 * Handles inbound Telegram webhook updates.
 * Calls Supabase REST API for all data.
 * Calls Telegram Bot API for all outbound messages.
 *
 * Setup:
 *   wrangler secret put TELEGRAM_BOT_TOKEN
 *   wrangler secret put TELEGRAM_BOT_NAME   (without @)
 *   wrangler secret put SUPABASE_URL
 *   wrangler secret put SUPABASE_SERVICE_KEY
 *   wrangler secret put WEBHOOK_SECRET      (random string, set in setWebhook)
 *   wrangler deploy
 *   Then: POST https://api.telegram.org/bot<TOKEN>/setWebhook
 *         { url: "https://schood-bot.<subdomain>.workers.dev/webhook", secret_token: <WEBHOOK_SECRET> }
 */

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_BOT_NAME: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  WEBHOOK_SECRET: string;
  SITE_URL: string;
}

// ─── Telegram helpers ─────────────────────────────────────────────────────────

const tg = (token: string, method: string, body?: unknown) =>
  fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).then((r) => r.json());

const send = (token: string, chatId: number | string, text: string, extra?: Record<string, unknown>) =>
  tg(token, "sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...extra });

const answerCallback = (token: string, callbackQueryId: string, text?: string) =>
  tg(token, "answerCallbackQuery", { callback_query_id: callbackQueryId, text });

// ─── Supabase REST helpers ────────────────────────────────────────────────────

const sbGet = async (env: Env, table: string, params: Record<string, string>) => {
  const qs = new URLSearchParams(params);
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    headers: { "apikey": env.SUPABASE_SERVICE_KEY, "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`, "Accept": "application/json" },
  });
  return res.ok ? res.json() : null;
};

const sbRpc = async (env: Env, fn: string, body: unknown) => {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { "apikey": env.SUPABASE_SERVICE_KEY, "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok ? res.json() : null;
};

const sbEdge = async (env: Env, fn: string, body: unknown, noVerifyJwt = false) => {
  const res = await fetch(`${env.SUPABASE_URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok ? res.json() : null;
};

// ─── Get linked user from chat_id ─────────────────────────────────────────────

const getUser = async (env: Env, chatId: number): Promise<{ id: string; email: string; name: string } | null> => {
  const rows = await sbGet(env, "users", { telegram_chat_id: `eq.${chatId}`, select: "id,email,raw_user_meta_data", limit: "1" });
  if (!rows || rows.length === 0) return null;
  const u = rows[0];
  const name = u.raw_user_meta_data?.full_name || u.email?.split("@")[0] || "Student";
  return { id: u.id, email: u.email, name };
};

// ─── Command handlers ─────────────────────────────────────────────────────────

const handleStart = async (env: Env, chatId: number, from: { first_name?: string }, param: string) => {
  // param is the token from the deep link (?start=<token>)
  if (param) {
    const result = await sbEdge(env, "telegram-link", { action: "validate", token: param, chat_id: String(chatId) });
    if (result?.ok) {
      await send(env.TELEGRAM_BOT_TOKEN, chatId,
        `✅ <b>Account linked!</b>\n\nWelcome to Schood, <b>${result.name}</b>! 🎓\n\nYou'll now receive notifications here for scores, assignments, certificates, and more.\n\nType /help to see all commands.`
      );
    } else {
      await send(env.TELEGRAM_BOT_TOKEN, chatId,
        `❌ <b>Link failed.</b>\n\n${result?.error || "Invalid or expired link."}\n\nGenerate a new link from your Schood account at <a href="${env.SITE_URL}">${env.SITE_URL}</a>`
      );
    }
    return;
  }

  // No param — show welcome
  const user = await getUser(env, chatId);
  if (user) {
    await send(env.TELEGRAM_BOT_TOKEN, chatId,
      `👋 Welcome back, <b>${user.name}</b>!\n\nType /help for all commands.`
    );
  } else {
    await send(env.TELEGRAM_BOT_TOKEN, chatId,
      `👋 Hi ${from.first_name ?? "there"}! I'm the <b>Schood</b> bot.\n\nTo get started, link your Schood account:\n1. Go to <a href="${env.SITE_URL}">${env.SITE_URL}</a>\n2. Open your profile\n3. Click <b>"Link Telegram"</b>\n\nYou'll get a button that opens this chat automatically.`
    );
  }
};

const handleHelp = async (env: Env, chatId: number, user: { name: string } | null) => {
  const linked = !!user;
  const msg = `<b>Schood Bot Commands</b>\n\n`
    + (linked ? `` : `⚠️ <i>Link your account first: /start</i>\n\n`)
    + `/results — Your recent test scores\n`
    + `/assignments — Assignments due this week\n`
    + `/schedule — Your class timetable\n`
    + `/cert — Your latest certificate\n`
    + `/drill — Start a vocabulary flashcard session\n`
    + `/me — Your profile & active plans\n`
    + `/unlink — Disconnect this Telegram from Schood\n`
    + `/help — This message`;
  await send(env.TELEGRAM_BOT_TOKEN, chatId, msg);
};

const handleMe = async (env: Env, chatId: number, user: { id: string; name: string; email: string }) => {
  // Load entitlements
  const entitlements = await sbGet(env, "entitlements", {
    user_id: `eq.${user.id}`, is_active: "eq.true", select: "resource_id,ends_at,products(name)", limit: "5",
  });

  const lines = [`👤 <b>${user.name}</b>\n📧 ${user.email}\n`];
  if (entitlements?.length > 0) {
    lines.push(`\n🎟 <b>Active access:</b>`);
    for (const e of entitlements) {
      const product = e.products?.name ?? e.resource_id;
      const expiry = e.ends_at ? ` (until ${new Date(e.ends_at).toLocaleDateString()})` : " (lifetime)";
      lines.push(`• ${product}${expiry}`);
    }
  } else {
    lines.push(`\nNo active plans. Visit <a href="${env.SITE_URL}/pricing">${env.SITE_URL}/pricing</a>`);
  }
  await send(env.TELEGRAM_BOT_TOKEN, chatId, lines.join("\n"));
};

const handleResults = async (env: Env, chatId: number, user: { id: string; name: string }) => {
  const outcomes = await sbGet(env, "exam_outcomes", {
    user_id: `eq.${user.id}`, status: `eq.completed`,
    select: "exam_type,overall_band,overall_score,computed_at",
    order: "computed_at.desc", limit: "5",
  });

  if (!outcomes?.length) {
    await send(env.TELEGRAM_BOT_TOKEN, chatId, `📊 No completed exams yet.\n\nTake a practice test at <a href="${env.SITE_URL}">${env.SITE_URL}</a>`);
    return;
  }

  const lines = [`📊 <b>Your recent scores</b>\n`];
  for (const o of outcomes) {
    const score = o.overall_band ?? o.overall_score ?? "—";
    const date = new Date(o.computed_at).toLocaleDateString();
    lines.push(`• <b>${String(o.exam_type ?? "").toUpperCase()}</b>: ${score} — ${date}`);
  }
  await send(env.TELEGRAM_BOT_TOKEN, chatId, lines.join("\n"));
};

const handleAssignments = async (env: Env, chatId: number, user: { id: string }) => {
  // Find the user as an academy contact
  const contacts = await sbGet(env, "academy_contacts", { user_id: `eq.${user.id}`, select: "id,academy_id", limit: "5" });
  if (!contacts?.length) {
    await send(env.TELEGRAM_BOT_TOKEN, chatId, `📋 You're not enrolled in any academy classrooms yet.`);
    return;
  }

  const contactIds = contacts.map((c: any) => c.id);
  const weekEnd = new Date(Date.now() + 7 * 86400000).toISOString();

  // Get pending submissions grouped by assignment
  const subs = await sbGet(env, "academy_submissions", {
    contact_id: `in.(${contactIds.join(",")})`,
    status: `in.(missing,submitted)`,
    select: "assignment_id,status,academy_assignments(title,due_at,classroom_id)",
    limit: "10",
  });

  if (!subs?.length) {
    await send(env.TELEGRAM_BOT_TOKEN, chatId, `✅ No pending assignments this week!`);
    return;
  }

  const lines = [`📋 <b>Your assignments</b>\n`];
  for (const s of subs) {
    const a = s.academy_assignments;
    if (!a) continue;
    const due = a.due_at ? ` — due ${new Date(a.due_at).toLocaleDateString()}` : "";
    const emoji = s.status === "missing" ? "⚠️" : "📝";
    lines.push(`${emoji} ${a.title}${due}`);
  }
  await send(env.TELEGRAM_BOT_TOKEN, chatId, lines.join("\n"));
};

const handleSchedule = async (env: Env, chatId: number, user: { id: string }) => {
  const contacts = await sbGet(env, "academy_contacts", { user_id: `eq.${user.id}`, select: "id", limit: "5" });
  if (!contacts?.length) {
    await send(env.TELEGRAM_BOT_TOKEN, chatId, `📅 No class schedule found. Ask your teacher to set up a timetable.`);
    return;
  }
  const contactIds = contacts.map((c: any) => c.id);

  // Get classroom memberships
  const memberships = await sbGet(env, "academy_classroom_memberships", {
    contact_id: `in.(${contactIds.join(",")})`, role: `in.(student,observer)`,
    select: "classroom_id", limit: "10",
  });
  if (!memberships?.length) {
    await send(env.TELEGRAM_BOT_TOKEN, chatId, `📅 You're not in any classrooms yet.`);
    return;
  }

  const classroomIds = [...new Set(memberships.map((m: any) => m.classroom_id))];
  const schedules = await sbGet(env, "academy_classroom_schedules", {
    classroom_id: `in.(${classroomIds.join(",")})`,
    select: "day_of_week,start_time,end_time,label,meet_url,academy_classrooms(name)",
    order: "day_of_week.asc,start_time.asc", limit: "14",
  });

  if (!schedules?.length) {
    await send(env.TELEGRAM_BOT_TOKEN, chatId, `📅 Your teacher hasn't set a schedule yet.`);
    return;
  }

  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const lines = [`📅 <b>Your weekly schedule</b>\n`];
  for (const s of schedules) {
    const day = DAYS[(s.day_of_week - 1) % 7] ?? s.day_of_week;
    const time = `${s.start_time}${s.end_time ? `–${s.end_time}` : ""}`;
    const name = s.academy_classrooms?.name ?? "Class";
    const label = s.label ? ` (${s.label})` : "";
    const link = s.meet_url ? ` 🔗 <a href="${s.meet_url}">Join</a>` : "";
    lines.push(`• <b>${day}</b> ${time} — ${name}${label}${link}`);
  }
  await send(env.TELEGRAM_BOT_TOKEN, chatId, lines.join("\n"));
};

const handleCert = async (env: Env, chatId: number, user: { id: string; name: string }) => {
  const certs = await sbGet(env, "issued_certificates", {
    user_id: `eq.${user.id}`, is_public: "eq.true",
    select: "public_token,exam_type,overall_band,overall_score,exam_date",
    order: "issued_at.desc", limit: "3",
  });

  if (!certs?.length) {
    await send(env.TELEGRAM_BOT_TOKEN, chatId,
      `🏆 No certificates yet.\n\nComplete a mock exam and issue your first certificate at <a href="${env.SITE_URL}/certificate">${env.SITE_URL}/certificate</a>`
    );
    return;
  }

  const lines = [`🏆 <b>Your certificates</b>\n`];
  for (const c of certs) {
    const score = c.overall_band ?? c.overall_score ?? "—";
    const date = new Date(c.exam_date).toLocaleDateString();
    const url = `${env.SITE_URL}/certificate?token=${c.public_token}`;
    lines.push(`• <b>${String(c.exam_type ?? "").toUpperCase()}</b> ${score} — ${date}\n  <a href="${url}">View & Share</a>`);
  }
  await send(env.TELEGRAM_BOT_TOKEN, chatId, lines.join("\n"));
};

const handleUnlink = async (env: Env, chatId: number) => {
  await sbEdge(env, "telegram-link", { action: "unlink", chat_id: String(chatId) });
  await send(env.TELEGRAM_BOT_TOKEN, chatId,
    `✅ Your Telegram has been unlinked from Schood.\n\nYou won't receive any more notifications here. You can re-link anytime from your Schood profile.`
  );
};

// ─── Vocab drill ─────────────────────────────────────────────────────────────
// Stateless: each drill message contains the card ID + answer in callback data.
// Telegram inline keyboards carry the state.

const handleDrill = async (env: Env, chatId: number, user: { id: string }) => {
  const card = await getNextDrillCard(env, user.id);
  if (!card) {
    await send(env.TELEGRAM_BOT_TOKEN, chatId, `🎉 <b>All done!</b> No cards due right now. Come back tomorrow!`);
    return;
  }
  await sendDrillCard(env, chatId, card);
};

const getNextDrillCard = async (env: Env, userId: string) => {
  const today = new Date().toISOString().slice(0, 10);
  // First ensure deck exists (call vocab-drill edge function to seed if needed)
  await fetch(`${env.SUPABASE_URL}/functions/v1/vocab-drill`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "stats" }),
  });

  const rows = await sbGet(env, "vocab_drill_cards", {
    user_id: `eq.${userId}`, next_review: `lte.${today}`,
    select: "id,word,definition,example", order: "next_review.asc", limit: "1",
  });
  return rows?.[0] ?? null;
};

const sendDrillCard = async (env: Env, chatId: number, card: { id: string; word: string; definition: string; example?: string | null }) => {
  const keyboard = {
    inline_keyboard: [[
      { text: "Show answer", callback_data: `drill_reveal:${card.id}` },
    ]],
  };
  await send(env.TELEGRAM_BOT_TOKEN, chatId,
    `📚 <b>Vocab Drill</b>\n\n<b>${card.word}</b>\n\nDo you know this word?`,
    { reply_markup: keyboard }
  );
};

const sendDrillReveal = async (env: Env, chatId: number, card: { id: string; word: string; definition: string; example?: string | null }) => {
  const keyboard = {
    inline_keyboard: [[
      { text: "❌ Again", callback_data: `drill_rate:${card.id}:1` },
      { text: "😓 Hard", callback_data: `drill_rate:${card.id}:3` },
      { text: "👍 Good", callback_data: `drill_rate:${card.id}:4` },
      { text: "⚡ Easy", callback_data: `drill_rate:${card.id}:5` },
    ]],
  };
  const example = card.example ? `\n\n<i>"${card.example}"</i>` : "";
  await send(env.TELEGRAM_BOT_TOKEN, chatId,
    `📚 <b>${card.word}</b>\n\n${card.definition}${example}\n\nHow well did you know it?`,
    { reply_markup: keyboard }
  );
};

const handleDrillRate = async (env: Env, chatId: number, userId: string, cardId: string, quality: number) => {
  // Submit rating
  await fetch(`${env.SUPABASE_URL}/functions/v1/vocab-drill`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${env.SUPABASE_SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "review", card_id: cardId, quality }),
  });

  // Get next card
  const next = await getNextDrillCard(env, userId);
  if (!next) {
    await send(env.TELEGRAM_BOT_TOKEN, chatId, `🎉 Session complete! All due cards reviewed.\n\nType /drill again tomorrow.`);
  } else {
    await sendDrillCard(env, chatId, next);
  }
};

// ─── Callback query handler ───────────────────────────────────────────────────

const handleCallback = async (env: Env, query: { id: string; from: { id: number }; data?: string; message?: { chat: { id: number }; message_id: number } }) => {
  const chatId = query.message?.chat.id ?? query.from.id;
  const data = query.data ?? "";

  await answerCallback(env.TELEGRAM_BOT_TOKEN, query.id);

  const user = await getUser(env, chatId);
  if (!user) {
    await send(env.TELEGRAM_BOT_TOKEN, chatId, `Please link your account first. Type /start`);
    return;
  }

  if (data.startsWith("drill_reveal:")) {
    const cardId = data.split(":")[1];
    const rows = await sbGet(env, "vocab_drill_cards", { id: `eq.${cardId}`, select: "id,word,definition,example", limit: "1" });
    const card = rows?.[0];
    if (card) await sendDrillReveal(env, chatId, card);
    return;
  }

  if (data.startsWith("drill_rate:")) {
    const [, cardId, qualityStr] = data.split(":");
    const quality = parseInt(qualityStr, 10);
    await handleDrillRate(env, chatId, user.id, cardId, quality);
    return;
  }
};

// ─── Main webhook handler ─────────────────────────────────────────────────────

const handleUpdate = async (env: Env, update: Record<string, unknown>) => {
  // Callback queries (button taps)
  if (update.callback_query) {
    await handleCallback(env, update.callback_query as any);
    return;
  }

  const msg = update.message as Record<string, unknown> | undefined;
  if (!msg) return;

  const chatId = (msg.chat as any)?.id as number;
  const from = (msg.from ?? {}) as { id: number; first_name?: string };
  const text = String(msg.text ?? "").trim();
  if (!chatId || !text) return;

  const [cmd, ...args] = text.split(/\s+/);
  const command = cmd.replace(/@\w+$/, "").toLowerCase(); // strip @botname suffix
  const param = args.join(" ");

  if (command === "/start") { await handleStart(env, chatId, from, param); return; }
  if (command === "/help") { await handleHelp(env, chatId, await getUser(env, chatId)); return; }
  if (command === "/unlink") { await handleUnlink(env, chatId); return; }

  // All other commands require a linked account
  const user = await getUser(env, chatId);
  if (!user) {
    await send(env.TELEGRAM_BOT_TOKEN, chatId,
      `👋 Your Telegram isn't linked to a Schood account yet.\n\nVisit <a href="${env.SITE_URL}">${env.SITE_URL}</a>, open your profile, and click <b>"Link Telegram"</b>.`
    );
    return;
  }

  if (command === "/me")          { await handleMe(env, chatId, user); return; }
  if (command === "/results")     { await handleResults(env, chatId, user); return; }
  if (command === "/assignments") { await handleAssignments(env, chatId, user); return; }
  if (command === "/schedule")    { await handleSchedule(env, chatId, user); return; }
  if (command === "/cert")        { await handleCert(env, chatId, user); return; }
  if (command === "/drill")       { await handleDrill(env, chatId, user); return; }

  // Unknown command — suggest help
  await send(env.TELEGRAM_BOT_TOKEN, chatId, `Unknown command. Type /help to see what I can do.`);
};

// ─── Entry point ─────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Health check
    if (url.pathname === "/") return new Response("Schood Bot is running", { status: 200 });

    // Telegram sends updates to /webhook
    if (url.pathname === "/webhook" && request.method === "POST") {
      // Verify the request is from Telegram using the secret token header
      const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (env.WEBHOOK_SECRET && secret !== env.WEBHOOK_SECRET) {
        return new Response("Forbidden", { status: 403 });
      }

      let update: Record<string, unknown>;
      try {
        update = await request.json();
      } catch {
        return new Response("Bad request", { status: 400 });
      }

      // Handle the update asynchronously — Telegram needs a 200 fast
      // Use waitUntil if available (Cloudflare Workers)
      const ctx = (request as any)[Symbol.for("cloudflare")]?.ctx;
      const handlePromise = handleUpdate(env, update).catch((err) => {
        console.error("handleUpdate error:", err);
      });
      if (ctx?.waitUntil) ctx.waitUntil(handlePromise);
      else await handlePromise;

      return new Response("OK", { status: 200 });
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

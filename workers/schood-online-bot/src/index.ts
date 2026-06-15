/**
 * Public Schood ecosystem Telegram bot.
 *
 * This Worker backs @schoodonlinebot as the public map of Schood. Private
 * student data stays in @schoodstudentbot and the /telegram Mini App.
 */

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  WEBHOOK_SECRET: string;
  SITE_URL: string;
  DISCOVER_APP_URL: string;
  STUDENT_BOT_URL: string;
  TELEGRAM_BOT_NAME?: string;
}

type InlineButton = {
  text: string;
  url?: string;
  callback_data?: string;
  web_app?: { url: string };
};

type TelegramMessage = {
  chat?: { id?: number | string; type?: string };
  from?: { id?: number; first_name?: string; username?: string };
  text?: string;
};

type CallbackQuery = {
  id: string;
  from: { id: number; first_name?: string; username?: string };
  data?: string;
  message?: { chat?: { id?: number | string } };
};

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const tg = async (env: Env, method: string, body?: unknown) => {
  const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) console.error("Telegram API error", method, payload);
  return payload;
};

const markup = (rows: InlineButton[][]) => ({ inline_keyboard: rows });

const send = (env: Env, chatId: number | string, text: string, rows?: InlineButton[][]) =>
  tg(env, "sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: rows ? markup(rows) : undefined,
  });

const answerCallback = (env: Env, callbackQueryId: string, text?: string) =>
  tg(env, "answerCallbackQuery", { callback_query_id: callbackQueryId, text });

const appButton = (env: Env, text = "Open Schood map"): InlineButton => ({ text, web_app: { url: env.DISCOVER_APP_URL } });

const homeRows = (env: Env): InlineButton[][] => [
  [appButton(env, "Open Schood ecosystem")],
  [
    { text: "Exam prep", callback_data: "exams" },
    { text: "English", callback_data: "english" },
  ],
  [
    { text: "Academy OS", callback_data: "academy" },
    { text: "Support", callback_data: "support" },
  ],
  [{ text: "Student login", url: env.STUDENT_BOT_URL }],
];

const startText = (name?: string) =>
  `<b>Welcome${name ? `, ${escapeHtml(name)}` : ""}.</b>\n\n`
  + `This is Schood's public Telegram gateway: IELTS, SAT, TOEFL, English learning, Academy OS, center operations, payments, certificates, and support.\n\n`
  + `Use the Mini App to choose your path. If you already study with Schood, use the student bot for private assignments, grades, attendance, billing, and vocab.`;

const helpText =
  `<b>Schood public bot commands</b>\n\n`
  + `/start - Open the Schood ecosystem gateway\n`
  + `/explore - Launch the Mini App map\n`
  + `/exams - IELTS, SAT, TOEFL, iTEP\n`
  + `/english - English Hub and skill practice\n`
  + `/academy - Academy OS and classroom tools\n`
  + `/centers - Center and partner operations\n`
  + `/pricing - Plans and checkout\n`
  + `/student - Open the linked student bot\n`
  + `/support - Ask Schood for help\n`
  + `/help - This message`;

const routeText: Record<string, string> = {
  exams:
    `<b>Exam prep on Schood</b>\n\n`
    + `Pick the surface you need: full IELTS mocks, IELTS Practice OS, SAT, TOEFL, or iTEP readiness.`,
  english:
    `<b>English learning ecosystem</b>\n\n`
    + `Reading, listening, writing, speaking, grammar, vocabulary, immersion, writing tutor, and spaced review.`,
  academy:
    `<b>Academy OS</b>\n\n`
    + `For teachers and centers: classrooms, gradebook, attendance, assignments, student billing, parent reports, certificates, and Telegram workflows.`,
  centers:
    `<b>For centers and partners</b>\n\n`
    + `Run your academy, dispatch vouchers, manage contacts, sell access, and keep student operations inside Schood.`,
  pricing:
    `<b>Pricing and checkout</b>\n\n`
    + `Open Schood pricing for plans, coupons, Click payment, trials, and checkout.`,
  support:
    `<b>Schood support</b>\n\n`
    + `Open the Mini App support panel and tell us what you need. We will route it to student support, academy setup, billing, or partnership follow-up.`,
  student:
    `<b>Student command center</b>\n\n`
    + `Private student data lives in @schoodstudentbot: assignments, grades, attendance, payments, certificates, vocab, and linked-account support.`,
};

const routeRows = (env: Env, route: string): InlineButton[][] => {
  if (route === "exams") {
    return [
      [
        { text: "IELTS", url: "https://ielts.schood.online" },
        { text: "IELTS Practice", url: "https://practice.ielts.schood.online" },
      ],
      [
        { text: "SAT", url: "https://sat.schood.online" },
        { text: "TOEFL", url: "https://toefl.schood.online" },
      ],
      [{ text: "iTEP", url: "https://itep.schood.online" }],
      [appButton(env)],
    ];
  }
  if (route === "english") {
    return [
      [{ text: "English Hub", url: "https://english.schood.online" }],
      [
        { text: "Writing Tutor", url: `${env.SITE_URL}/writing-tutor` },
        { text: "Vocab Drill", url: `${env.SITE_URL}/vocab-drill` },
      ],
      [appButton(env)],
    ];
  }
  if (route === "academy") {
    return [
      [
        { text: "Academy OS", url: `${env.SITE_URL}/academy` },
        { text: "My Academy", url: `${env.SITE_URL}/my-academy` },
      ],
      [
        { text: "Student bot", url: env.STUDENT_BOT_URL },
        { text: "Pricing", url: `${env.SITE_URL}/pricing` },
      ],
      [appButton(env)],
    ];
  }
  if (route === "centers") {
    return [
      [
        { text: "Center Office", url: `${env.SITE_URL}/center-office` },
        { text: "Partner Office", url: `${env.SITE_URL}/partner` },
      ],
      [{ text: "Education centers", url: `${env.SITE_URL}/education-centers` }],
      [appButton(env, "Open center guide")],
    ];
  }
  if (route === "pricing") return [[{ text: "Open pricing", url: `${env.SITE_URL}/pricing` }], [appButton(env)]];
  if (route === "support") return [[appButton(env, "Open support panel")], [{ text: "Contact page", url: `${env.SITE_URL}/contact` }]];
  if (route === "student") return [[{ text: "Open @schoodstudentbot", url: env.STUDENT_BOT_URL }], [appButton(env)]];
  return homeRows(env);
};

const sendRoute = (env: Env, chatId: number | string, route: string) =>
  send(env, chatId, routeText[route] ?? startText(), routeRows(env, route));

const handleMessage = async (env: Env, msg: TelegramMessage) => {
  const chatId = msg.chat?.id;
  if (!chatId) return;

  const text = String(msg.text ?? "").trim();
  const [rawCommand] = text.split(/\s+/);
  const command = rawCommand.replace(/@\w+$/, "").toLowerCase();

  if (!text || command === "/start") {
    await send(env, chatId, startText(msg.from?.first_name), homeRows(env));
    return;
  }

  if (command === "/help") { await send(env, chatId, helpText, homeRows(env)); return; }
  if (command === "/explore" || command === "/app") { await send(env, chatId, startText(msg.from?.first_name), homeRows(env)); return; }
  if (command === "/exams" || command === "/ielts" || command === "/sat" || command === "/toefl") { await sendRoute(env, chatId, "exams"); return; }
  if (command === "/english") { await sendRoute(env, chatId, "english"); return; }
  if (command === "/academy") { await sendRoute(env, chatId, "academy"); return; }
  if (command === "/centers" || command === "/partners") { await sendRoute(env, chatId, "centers"); return; }
  if (command === "/pricing") { await sendRoute(env, chatId, "pricing"); return; }
  if (command === "/support") { await sendRoute(env, chatId, "support"); return; }
  if (command === "/student" || command === "/dashboard") { await sendRoute(env, chatId, "student"); return; }

  await send(
    env,
    chatId,
    `I can route you around Schood. Type /help or open the ecosystem map below.`,
    homeRows(env),
  );
};

const handleCallback = async (env: Env, query: CallbackQuery) => {
  await answerCallback(env, query.id);
  const chatId = query.message?.chat?.id ?? query.from.id;
  const route = String(query.data ?? "").trim().toLowerCase();
  await sendRoute(env, chatId, route);
};

const handleUpdate = async (env: Env, update: Record<string, unknown>) => {
  if (update.callback_query) {
    await handleCallback(env, update.callback_query as CallbackQuery);
    return;
  }
  if (update.message) await handleMessage(env, update.message as TelegramMessage);
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response("Schood public bot is running", { status: 200 });
    }

    if (url.pathname === "/webhook" && request.method === "POST") {
      const receivedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
      if (env.WEBHOOK_SECRET && receivedSecret !== env.WEBHOOK_SECRET) return new Response("Unauthorized", { status: 401 });

      let update: Record<string, unknown>;
      try {
        update = await request.json();
      } catch {
        return new Response("Bad request", { status: 400 });
      }

      ctx.waitUntil(handleUpdate(env, update).catch((error) => console.error("handleUpdate error", error)));
      return new Response("OK", { status: 200 });
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

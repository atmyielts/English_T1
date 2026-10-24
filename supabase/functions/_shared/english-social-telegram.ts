// Telegram side of duels and parent progress links in @schoodstudentbot.
//
// Pure: callback data, /start parameters and every message the bot sends for
// these features (HTML parse mode, so every value from a learner is escaped).
// The hub (/internal/telegram-social) returns these replies; the Worker only
// maps buttons to Telegram markup (workers/schood-bot/src/social.ts).

import { DUEL_CODE_LENGTH, type DuelOutcome, type DuelView, normalizeDuelCode } from "./english-duel.ts";

export type SocialLocale = "en" | "ru" | "uz";

/** Telegram's language_code → one of our three languages (English otherwise). */
export const socialLocale = (code: unknown): SocialLocale => {
  const value = String(code ?? "").toLowerCase();
  return value.startsWith("ru") ? "ru" : value.startsWith("uz") ? "uz" : "en";
};

/** Escapes text for Telegram's HTML parse mode. */
export const escapeTelegramHtml = (value: unknown): string =>
  String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type BotButton = { text: string; callback_data?: string; url?: string; web_app_route?: string };
export type BotReply = { text: string; buttons: BotButton[][] };

// === Callback data and start parameters ===

const TELEGRAM_CALLBACK_LIMIT = 64;
const CODE = `[A-HJ-NP-Z2-9]{${DUEL_CODE_LENGTH}}`;
const START_RE = new RegExp(`^edu:s:(${CODE})$`);
const REMATCH_RE = new RegExp(`^edu:r:(${CODE})$`);
const ANSWER_RE = new RegExp(`^edu:a:(${CODE}):(\\d):(\\d)$`);
const STOP_RE = /^epl:stop:([0-9a-f-]{36})$/;

export const duelStartData = (code: string) => `edu:s:${code}`;
export const duelRematchData = (code: string) => `edu:r:${code}`;
export const duelAnswerData = (code: string, index: number, choice: number): string => {
  if (!normalizeDuelCode(code) || !Number.isInteger(index) || index < 0 || index > 9 || !Number.isInteger(choice) || choice < 0 || choice > 9) {
    throw new Error("Invalid duel callback");
  }
  return `edu:a:${code}:${index}:${choice}`;
};
export const parentStopData = (watcherId: string) => `epl:stop:${watcherId}`;

export type SocialCallback =
  | { kind: "duel_start"; code: string }
  | { kind: "duel_rematch"; code: string }
  | { kind: "duel_answer"; code: string; index: number; choice: number }
  | { kind: "parent_stop"; watcher_id: string };

export const parseSocialCallback = (data: unknown): SocialCallback | null => {
  if (typeof data !== "string" || data.length > TELEGRAM_CALLBACK_LIMIT) return null;
  let match = START_RE.exec(data);
  if (match) return { kind: "duel_start", code: match[1]! };
  match = REMATCH_RE.exec(data);
  if (match) return { kind: "duel_rematch", code: match[1]! };
  match = ANSWER_RE.exec(data);
  if (match) return { kind: "duel_answer", code: match[1]!, index: Number(match[2]), choice: Number(match[3]) };
  match = STOP_RE.exec(data);
  if (match) return { kind: "parent_stop", watcher_id: match[1]! };
  return null;
};

/** `duel_<code>` and `pl_<token>`: the deep links this feature hands out. */
export type SocialStart = { kind: "duel"; code: string } | { kind: "parent"; token: string };

export const parseSocialStart = (param: unknown): SocialStart | null => {
  if (typeof param !== "string") return null;
  const value = param.trim();
  if (value.startsWith("duel_")) {
    const code = normalizeDuelCode(value.slice(5));
    return code ? { kind: "duel", code } : null;
  }
  if (/^pl_[A-Za-z0-9_-]{32}$/.test(value)) return { kind: "parent", token: value.slice(3) };
  return null;
};

export const botStartUrl = (botName: string, param: string) =>
  `https://t.me/${encodeURIComponent(botName)}?start=${encodeURIComponent(param)}`;

/** Telegram's share sheet for a link and a line of text. */
export const telegramShareUrl = (url: string, text: string) =>
  `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;

// === Strings ===

type Strings = Record<string, string>;

const S: Record<SocialLocale, Strings> = {
  en: {
    friend: "your friend",
    notLinked: "Link your Telegram to Schood first: open the Schood app below, sign in once and use <b>Account → Link Telegram</b>. Then tap the duel link again.",
    openApp: "Open Schood",
    unavailable: "Duels are not available right now. Please try again in a minute.",
    paused: "Duels are paused for a short while. Please try again later.",
    created: "<b>Vocabulary duel</b>\n\n10 words, 60 seconds each. Send this invite to a friend. When they join, you both play in your own time and see who knows more words.\n\nThe invite works for 24 hours.",
    shareButton: "Send to a friend",
    shareText: "Vocabulary duel on Schood English: 10 words, 60 seconds. Can you beat me?",
    webButton: "Play on the website",
    miniButton: "Play in the app",
    limit: "You have started a lot of duels today. Try again tomorrow.",
    notFound: "This duel link is not valid.",
    expired: "This duel has expired. Ask your friend for a new one.",
    taken: "Someone else has already accepted this duel.",
    own: "This is your own duel. Send the invite to a friend.",
    noWords: "There are not enough words for a duel yet. Please try again later.",
    ready: "<b>Duel with {name}</b>\n\n10 questions. Pick the word that matches each meaning. Your 60 seconds start when you tap Start.",
    readyCreator: "<b>{name} accepted your duel!</b>\n\n10 questions. Pick the word that matches each meaning. Your 60 seconds start when you tap Start.",
    start: "Start",
    question: "<b>{index}/{total}</b> · ⏱ {seconds}s\n\n{prompt}",
    right: "✅ <b>{word}</b>",
    wrong: "❌ Correct: <b>{word}</b>",
    rightToast: "Correct!",
    wrongToast: "Not quite",
    timeUp: "⏱ Time is up!",
    alreadyAnswered: "Already answered",
    doneWaiting: "<b>Done: {correct} of 10 correct.</b>\n\nWaiting for {name}. You will get the result here.",
    resultWin: "🏆 <b>You won!</b>",
    resultLoss: "<b>{name} won this time.</b>",
    resultDraw: "🤝 <b>A draw!</b>",
    resultWalkover: "🏆 <b>You won: {name} did not play.</b>",
    resultForfeit: "<b>You did not play this duel.</b>",
    resultLine: "You: {mine}/10 · {name}: {theirs}/10",
    resultXp: "+{xp} XP",
    rematch: "Rematch",
    details: "See the answers",
    rematchSent: "Rematch started. {name} will get an invite.",
    notYours: "This duel is not yours.",
  },
  ru: {
    friend: "ваш друг",
    notLinked: "Сначала привяжите Telegram к Schood: откройте приложение Schood ниже, войдите и выберите <b>Аккаунт → Привязать Telegram</b>. Потом снова нажмите на ссылку дуэли.",
    openApp: "Открыть Schood",
    unavailable: "Дуэли сейчас недоступны. Попробуйте через минуту.",
    paused: "Дуэли ненадолго приостановлены. Попробуйте позже.",
    created: "<b>Дуэль на слова</b>\n\n10 слов, у каждого 60 секунд. Отправьте приглашение другу. Когда он примет его, каждый играет в удобное время, и вы узнаете, кто знает больше слов.\n\nПриглашение действует 24 часа.",
    shareButton: "Отправить другу",
    shareText: "Дуэль на слова в Schood English: 10 слов, 60 секунд. Сможешь меня обыграть?",
    webButton: "Играть на сайте",
    miniButton: "Играть в приложении",
    limit: "Сегодня вы начали уже много дуэлей. Попробуйте завтра.",
    notFound: "Эта ссылка на дуэль недействительна.",
    expired: "Срок дуэли истёк. Попросите у друга новую.",
    taken: "Эту дуэль уже принял кто-то другой.",
    own: "Это ваша дуэль. Отправьте приглашение другу.",
    noWords: "Пока не хватает слов для дуэли. Попробуйте позже.",
    ready: "<b>Дуэль с {name}</b>\n\n10 вопросов. Выберите слово, которое подходит к значению. Ваши 60 секунд начнутся, когда вы нажмёте «Начать».",
    readyCreator: "<b>{name} принял(а) вашу дуэль!</b>\n\n10 вопросов. Выберите слово, которое подходит к значению. Ваши 60 секунд начнутся, когда вы нажмёте «Начать».",
    start: "Начать",
    question: "<b>{index}/{total}</b> · ⏱ {seconds} с\n\n{prompt}",
    right: "✅ <b>{word}</b>",
    wrong: "❌ Правильно: <b>{word}</b>",
    rightToast: "Верно!",
    wrongToast: "Не совсем",
    timeUp: "⏱ Время вышло!",
    alreadyAnswered: "Уже отвечено",
    doneWaiting: "<b>Готово: {correct} из 10 верно.</b>\n\nЖдём {name}. Результат придёт сюда.",
    resultWin: "🏆 <b>Вы победили!</b>",
    resultLoss: "<b>В этот раз победил(а) {name}.</b>",
    resultDraw: "🤝 <b>Ничья!</b>",
    resultWalkover: "🏆 <b>Победа: {name} не сыграл(а).</b>",
    resultForfeit: "<b>Вы не сыграли эту дуэль.</b>",
    resultLine: "Вы: {mine}/10 · {name}: {theirs}/10",
    resultXp: "+{xp} XP",
    rematch: "Реванш",
    details: "Посмотреть ответы",
    rematchSent: "Реванш начат. {name} получит приглашение.",
    notYours: "Это не ваша дуэль.",
  },
  uz: {
    friend: "doʻstingiz",
    notLinked: "Avval Telegramni Schood bilan bogʻlang: quyidagi Schood ilovasini oching, bir marta kiring va <b>Akkaunt → Telegramni bogʻlash</b> ni tanlang. Keyin duel havolasini yana bosing.",
    openApp: "Schood ni ochish",
    unavailable: "Duellar hozir ishlamayapti. Bir daqiqadan keyin urinib koʻring.",
    paused: "Duellar qisqa vaqtga toʻxtatilgan. Keyinroq urinib koʻring.",
    created: "<b>Soʻz dueli</b>\n\n10 ta soʻz, har biringizga 60 soniya. Taklifni doʻstingizga yuboring. U qabul qilgach, har biringiz qulay vaqtda oʻynaysiz va kim koʻproq soʻz bilishini bilib olasiz.\n\nTaklif 24 soat amal qiladi.",
    shareButton: "Doʻstga yuborish",
    shareText: "Schood English’da soʻz dueli: 10 ta soʻz, 60 soniya. Meni yuta olasanmi?",
    webButton: "Saytda oʻynash",
    miniButton: "Ilovada oʻynash",
    limit: "Bugun juda koʻp duel boshladingiz. Ertaga urinib koʻring.",
    notFound: "Bu duel havolasi notoʻgʻri.",
    expired: "Bu duel muddati tugagan. Doʻstingizdan yangisini soʻrang.",
    taken: "Bu duelni boshqa kishi qabul qilib boʻlgan.",
    own: "Bu sizning duelingiz. Taklifni doʻstingizga yuboring.",
    noWords: "Duel uchun hali soʻzlar yetarli emas. Keyinroq urinib koʻring.",
    ready: "<b>{name} bilan duel</b>\n\n10 ta savol. Har bir maʼnoga mos soʻzni tanlang. 60 soniyangiz «Boshlash» ni bosganingizda boshlanadi.",
    readyCreator: "<b>{name} duelingizni qabul qildi!</b>\n\n10 ta savol. Har bir maʼnoga mos soʻzni tanlang. 60 soniyangiz «Boshlash» ni bosganingizda boshlanadi.",
    start: "Boshlash",
    question: "<b>{index}/{total}</b> · ⏱ {seconds} s\n\n{prompt}",
    right: "✅ <b>{word}</b>",
    wrong: "❌ Toʻgʻrisi: <b>{word}</b>",
    rightToast: "Toʻgʻri!",
    wrongToast: "Unchalik emas",
    timeUp: "⏱ Vaqt tugadi!",
    alreadyAnswered: "Javob berilgan",
    doneWaiting: "<b>Tayyor: 10 tadan {correct} tasi toʻgʻri.</b>\n\n{name} kutilmoqda. Natija shu yerga keladi.",
    resultWin: "🏆 <b>Siz yutdingiz!</b>",
    resultLoss: "<b>Bu safar {name} yutdi.</b>",
    resultDraw: "🤝 <b>Durrang!</b>",
    resultWalkover: "🏆 <b>Gʻalaba: {name} oʻynamadi.</b>",
    resultForfeit: "<b>Siz bu duelni oʻynamadingiz.</b>",
    resultLine: "Siz: {mine}/10 · {name}: {theirs}/10",
    resultXp: "+{xp} XP",
    rematch: "Revansh",
    details: "Javoblarni koʻrish",
    rematchSent: "Revansh boshlandi. {name} taklif oladi.",
    notYours: "Bu sizning duelingiz emas.",
  },
};

/** A string with {placeholders} filled; every value is HTML-escaped. */
export const socialText = (locale: SocialLocale, key: string, params: Record<string, unknown> = {}): string => {
  const template = S[locale][key] ?? S.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => escapeTelegramHtml(params[name] ?? ""));
};

/** Plain text for toasts and button labels (no HTML there). */
export const socialPlain = (locale: SocialLocale, key: string, params: Record<string, unknown> = {}): string => {
  const template = S[locale][key] ?? S.en[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ""));
};

const nameOr = (locale: SocialLocale, name: string) => name || socialPlain(locale, "friend");

// === Duel replies ===

export type DuelLinks = { webUrl: string; botInviteUrl: string; miniAppRoute: string };

export const duelCreatedReply = (locale: SocialLocale, links: DuelLinks): BotReply => ({
  text: socialText(locale, "created"),
  buttons: [
    [{ text: socialPlain(locale, "shareButton"), url: telegramShareUrl(links.botInviteUrl, socialPlain(locale, "shareText")) }],
    [{ text: socialPlain(locale, "miniButton"), web_app_route: links.miniAppRoute }],
  ],
});

export const duelReadyReply = (locale: SocialLocale, code: string, opponentName: string, forCreator = false): BotReply => ({
  text: socialText(locale, forCreator ? "readyCreator" : "ready", { name: nameOr(locale, opponentName) }),
  buttons: [[{ text: socialPlain(locale, "start"), callback_data: duelStartData(code) }]],
});

/** One question: the meaning on top, one button per word. */
export const duelQuestionReply = (
  locale: SocialLocale,
  code: string,
  question: NonNullable<DuelView["question"]>,
  seconds: number,
): BotReply => ({
  text: socialText(locale, "question", { index: question.index + 1, total: question.total, seconds, prompt: question.prompt }),
  buttons: question.options.map((option, choice) => [{ text: option.slice(0, 60), callback_data: duelAnswerData(code, question.index, choice) }]),
});

/** The answered question, buttons removed, with the verdict. */
export const duelAnsweredText = (
  locale: SocialLocale,
  question: { index: number; total: number; prompt: string; options: string[] },
  correct: boolean,
  correctIndex: number,
): string => [
  socialText(locale, "question", { index: question.index + 1, total: question.total, seconds: "–", prompt: question.prompt }),
  "",
  socialText(locale, correct ? "right" : "wrong", { word: question.options[correctIndex] ?? "" }),
].join("\n");

const OUTCOME_KEY: Record<DuelOutcome, string> = {
  win: "resultWin",
  loss: "resultLoss",
  draw: "resultDraw",
  walkover: "resultWalkover",
  forfeit: "resultForfeit",
};

/** The final result for one player, or the "waiting for your friend" note. */
export const duelResultReply = (locale: SocialLocale, view: DuelView, links: DuelLinks): BotReply => {
  const name = nameOr(locale, view.opponent_name);
  if (view.status !== "finished" || !view.me.outcome) {
    return { text: socialText(locale, "doneWaiting", { correct: view.me.correct, name }), buttons: [] };
  }
  const theirs = view.opponent?.correct;
  const lines = [
    socialText(locale, OUTCOME_KEY[view.me.outcome], { name }),
    socialText(locale, "resultLine", { mine: view.me.correct, name, theirs: theirs === null || theirs === undefined ? "–" : theirs }),
    view.me.xp > 0 ? socialText(locale, "resultXp", { xp: view.me.xp }) : null,
  ].filter((line): line is string => Boolean(line));
  const buttons: BotButton[][] = [];
  if (view.can_rematch) buttons.push([{ text: socialPlain(locale, "rematch"), callback_data: duelRematchData(view.code) }]);
  buttons.push([{ text: socialPlain(locale, "details"), url: links.webUrl }]);
  return { text: lines.join("\n"), buttons };
};

export const notLinkedReply = (locale: SocialLocale): BotReply => ({
  text: socialText(locale, "notLinked"),
  buttons: [[{ text: socialPlain(locale, "openApp"), web_app_route: "" }]],
});

export const plainReply = (locale: SocialLocale, key: string, params: Record<string, unknown> = {}): BotReply => ({
  text: socialText(locale, key, params),
  buttons: [],
});

// === Parent progress link replies ===

const P: Record<SocialLocale, Strings> = {
  en: {
    subscribed: "<b>You will get {name}'s English report every Sunday evening.</b>\n\nIt shows practice time, activities by skill, streak and what to work on next. You can stop it any time.",
    subscribedAgain: "You already get {name}'s weekly report.",
    learner: "the learner",
    invalid: "This progress link is no longer active. Ask the learner for a new one.",
    stop: "Stop weekly reports",
    stopped: "Weekly reports stopped. You will not get any more messages about this learner.",
    stoppedToast: "Stopped",
    full: "This link already has the maximum number of Telegram followers.",
    view: "Open progress page",
  },
  ru: {
    subscribed: "<b>Каждое воскресенье вечером вы будете получать отчёт {name} по английскому.</b>\n\nВ нём время занятий, задания по разделам, серия дней и что подтянуть дальше. Отписаться можно в любой момент.",
    subscribedAgain: "Вы уже получаете еженедельный отчёт {name}.",
    learner: "ученика",
    invalid: "Эта ссылка на прогресс больше не действует. Попросите у ученика новую.",
    stop: "Отключить отчёты",
    stopped: "Еженедельные отчёты отключены. Сообщений об этом ученике больше не будет.",
    stoppedToast: "Отключено",
    full: "У этой ссылки уже максимальное число подписчиков в Telegram.",
    view: "Открыть страницу прогресса",
  },
  uz: {
    subscribed: "<b>Har yakshanba kechqurun {name} ning ingliz tili hisobotini olasiz.</b>\n\nUnda mashq vaqti, boʻlimlar boʻyicha mashqlar, ketma-ket kunlar va keyingi eʼtibor talab qiladigan jihat bor. Istalgan vaqtda toʻxtatish mumkin.",
    subscribedAgain: "Siz {name} ning haftalik hisobotini allaqachon olasiz.",
    learner: "oʻquvchi",
    invalid: "Bu progress havolasi endi ishlamaydi. Oʻquvchidan yangisini soʻrang.",
    stop: "Hisobotlarni toʻxtatish",
    stopped: "Haftalik hisobotlar toʻxtatildi. Bu oʻquvchi haqida boshqa xabar kelmaydi.",
    stoppedToast: "Toʻxtatildi",
    full: "Bu havolada Telegram kuzatuvchilari soni maksimal.",
    view: "Progress sahifasini ochish",
  },
};

export const parentText = (locale: SocialLocale, key: string, params: Record<string, unknown> = {}): string =>
  (P[locale][key] ?? P.en[key] ?? key).replace(/\{(\w+)\}/g, (_, name: string) => escapeTelegramHtml(params[name] ?? ""));

export const parentPlain = (locale: SocialLocale, key: string): string => P[locale][key] ?? P.en[key] ?? key;

export const parentSubscribedReply = (
  locale: SocialLocale,
  input: { firstName: string; watcherId: string; pageUrl: string; again: boolean },
): BotReply => ({
  text: parentText(locale, input.again ? "subscribedAgain" : "subscribed", { name: input.firstName || parentPlain(locale, "learner") }),
  buttons: [
    [{ text: parentPlain(locale, "view"), url: input.pageUrl }],
    [{ text: parentPlain(locale, "stop"), callback_data: parentStopData(input.watcherId) }],
  ],
});

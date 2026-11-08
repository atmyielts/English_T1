// Text that leaves the app: Telegram reminders and invitation emails, in the reader's
// language. Plain text only (no parse mode), so a test title cannot inject markup.
export type Locale = 'en' | 'ru' | 'uz';
export const LOCALES: readonly Locale[] = ['en', 'ru', 'uz'];

type Params = Record<string, unknown>;
type Template = (params: Params) => string;

const TASHKENT = 5 * 3_600_000;
const pad = (value: number) => String(value).padStart(2, '0');
/** 2026-11-06 → 06.11.2026 */
const day = (value: unknown): string => {
  const text = String(value ?? '');
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? `${text.slice(8, 10)}.${text.slice(5, 7)}.${text.slice(0, 4)}` : text;
};
/** An instant → 06.11 14:30 in Tashkent. */
const moment = (value: unknown): string => {
  const parsed = Date.parse(String(value ?? ''));
  if (Number.isNaN(parsed)) return '';
  const local = new Date(parsed + TASHKENT);
  return `${pad(local.getUTCDate())}.${pad(local.getUTCMonth() + 1)} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
};
const title = (params: Params) => String(params.title ?? '').slice(0, 160);

const MESSAGES: Record<Locale, Record<string, Template>> = {
  en: {
    assignment_due: (p) => `Your English assignment is due on ${day(p.date)}.`,
    test_todo: (p) => `You have an English test to take: ${title(p)}.`,
    session_soon: (p) => `English session soon: ${title(p)}, ${moment(p.at)} (Tashkent).`,
    candidate_finished: (p) => `A candidate has finished the test: ${title(p)}.`,
    seat_on: () => 'You now have a learning seat. Lessons and AI practice are open to you.',
    seat_off: () => 'Your learning seat has been removed. Your HR team can tell you more.',
    contract_ending: (p) => `Your agreement with Schood ends on ${day(p.date)}. Contact Schood to continue.`,
    weekly_digest: (p) => `This week: ${p.learners} of ${p.people} people learned for ${p.minutes} minutes. ${p.tests} tests graded, ${p.candidates} candidates finished. Learning counts only people who agreed to share it.`,
    other: (p) => title(p) || 'You have a new notification in Schood Company English.',
  },
  ru: {
    assignment_due: (p) => `Срок вашего задания по английскому: ${day(p.date)}.`,
    test_todo: (p) => `Вас ждёт тест по английскому: ${title(p)}.`,
    session_soon: (p) => `Скоро занятие по английскому: ${title(p)}, ${moment(p.at)} (Ташкент).`,
    candidate_finished: (p) => `Кандидат завершил тест: ${title(p)}.`,
    seat_on: () => 'Вам выдали учебное место. Уроки и практика с ИИ теперь открыты.',
    seat_off: () => 'Ваше учебное место снято. Подробности расскажет отдел кадров.',
    contract_ending: (p) => `Договор со Schood заканчивается ${day(p.date)}. Свяжитесь со Schood, чтобы продолжить.`,
    weekly_digest: (p) => `За неделю: учились ${p.learners} из ${p.people} сотрудников, всего ${p.minutes} мин. Проверено тестов: ${p.tests}, кандидатов завершили тест: ${p.candidates}. Обучение учитывается только у тех, кто согласился им делиться.`,
    other: (p) => title(p) || 'У вас новое уведомление в Schood Company English.',
  },
  uz: {
    assignment_due: (p) => `Ingliz tili topshirig‘ingiz muddati: ${day(p.date)}.`,
    test_todo: (p) => `Sizni ingliz tili testi kutmoqda: ${title(p)}.`,
    session_soon: (p) => `Tez orada ingliz tili mashg‘uloti: ${title(p)}, ${moment(p.at)} (Toshkent).`,
    candidate_finished: (p) => `Nomzod testni yakunladi: ${title(p)}.`,
    seat_on: () => 'Sizga o‘quv o‘rni berildi. Darslar va sun’iy intellekt bilan mashqlar endi ochiq.',
    seat_off: () => 'O‘quv o‘rningiz olib tashlandi. Batafsil ma’lumotni kadrlar bo‘limidan oling.',
    contract_ending: (p) => `Schood bilan shartnoma ${day(p.date)} kuni tugaydi. Davom etish uchun Schood bilan bog‘laning.`,
    weekly_digest: (p) => `Shu hafta: ${p.people} kishidan ${p.learners} nafari ${p.minutes} daqiqa o‘qidi. ${p.tests} ta test baholandi, ${p.candidates} nomzod testni yakunladi. O‘qish faqat rozilik berganlar bo‘yicha hisoblanadi.`,
    other: (p) => title(p) || 'Schood Company English’da yangi bildirishnoma bor.',
  },
};

const LINK_LABEL: Record<Locale, string> = { en: 'Open', ru: 'Открыть', uz: 'Ochish' };

/** The reminder for one notice, with a link to it when there is one. */
export function noticeText(locale: Locale, kind: string, params: Params, url: string | null): string {
  const template = MESSAGES[locale][kind] ?? MESSAGES[locale].other;
  const body = template(params);
  return url ? `${body}\n${LINK_LABEL[locale]}: ${url}` : body;
}

export const SAMPLE_KINDS = ['assignment_due', 'test_todo', 'session_soon', 'weekly_digest'] as const;

/** What HR sees before turning reminders on. */
export function sampleMessages(locale: Locale): { kind: string; text: string }[] {
  const params: Params = { date: '2026-12-01', at: '2026-12-01T09:30:00Z', title: 'Placement test', learners: 12, people: 20, minutes: 340, tests: 3, candidates: 2 };
  return SAMPLE_KINDS.map((kind) => ({ kind, text: noticeText(locale, kind, params, null) }));
}

/** The invitation email. The link is the only way in and is shown as plain text. */
export function inviteEmail(locale: Locale, company: string, name: string | null, link: string): { subject: string; text: string } {
  const who = (name ?? '').trim();
  switch (locale) {
    case 'en':
      return {
        subject: `${company} invites you to Schood Company English`,
        text: `${who ? `Hello, ${who}.` : 'Hello.'}\n\n${company} has invited you to Schood Company English, where you can take English tests and learn English for your job.\n\nAccept the invitation here:\n${link}\n\nThe link is personal and works once. Before joining you will see what your company can see and decide whether to share your progress.\n\nIf you do not expect this, ignore this email.`,
      };
    case 'uz':
      return {
        subject: `${company} sizni Schood Company English xizmatiga taklif qiladi`,
        text: `${who ? `Assalomu alaykum, ${who}.` : 'Assalomu alaykum.'}\n\n${company} sizni Schood Company English xizmatiga taklif qildi. Bu yerda ingliz tili testlarini topshirishingiz va ishingiz uchun ingliz tilini o‘rganishingiz mumkin.\n\nTaklifni shu havola orqali qabul qiling:\n${link}\n\nHavola shaxsiy va bir marta ishlaydi. Qo‘shilishdan oldin kompaniyangiz nimani ko‘rishini bilib olasiz va natijalaringizni ulashish-ulashmaslikni o‘zingiz hal qilasiz.\n\nAgar bu xatni kutmagan bo‘lsangiz, e’tibor bermang.`,
      };
    default:
      return {
        subject: `${company} приглашает вас в Schood Company English`,
        text: `${who ? `Здравствуйте, ${who}.` : 'Здравствуйте.'}\n\n${company} приглашает вас в Schood Company English: здесь можно пройти тесты по английскому и учить английский для своей работы.\n\nПринять приглашение можно по ссылке:\n${link}\n\nСсылка личная и срабатывает один раз. Перед тем как присоединиться, вы увидите, что будет видно компании, и решите, делиться ли прогрессом.\n\nЕсли вы не ждали этого письма, просто проигнорируйте его.`,
      };
  }
}

// Ready-to-send texts in en/ru/uz. Schood never sends them: HR copies a text or shares it
// to Telegram from their own account. A workspace may replace any template.
import { CompanyError } from '../types.ts';
import { text } from '../util.ts';

export const MESSAGE_KINDS = ['invite', 'reminder', 'interview', 'offer', 'rejection', 'feedback'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];
export const MESSAGE_LOCALES = ['en', 'ru', 'uz'] as const;
export type MessageLocale = (typeof MESSAGE_LOCALES)[number];
export interface MessageTemplate { subject: string; body: string }
export type CustomTemplates = Partial<Record<MessageKind, Partial<Record<MessageLocale, MessageTemplate>>>>;

export const DEFAULT_TEMPLATES: Record<MessageKind, Record<MessageLocale, MessageTemplate>> = {
  invite: {
    en: {
      subject: 'English test for {test} at {company}',
      body: 'Dear {name},\n\nThank you for your interest in {company}. As part of the application for {test}, we ask you to take a short online English test.\n\nYour personal link: {link}\n\nThe test takes up to {minutes} minutes and must be finished in one sitting, so please choose a quiet place. A phone works, but a computer is more comfortable.{closes_line}\n\nKind regards,\n{company}',
    },
    ru: {
      subject: 'Тест по английскому: {test}, {company}',
      body: 'Здравствуйте, {name}!\n\nСпасибо за интерес к {company}. В рамках отбора на позицию «{test}» просим вас пройти короткий онлайн-тест по английскому языку.\n\nВаша личная ссылка: {link}\n\nТест занимает до {minutes} мин. и проходится за один раз, поэтому выберите, пожалуйста, тихое место. Можно с телефона, но с компьютера удобнее.{closes_line}\n\nС уважением,\n{company}',
    },
    uz: {
      subject: 'Ingliz tili testi: {test}, {company}',
      body: 'Assalomu alaykum, {name}!\n\n{company} kompaniyasiga qiziqish bildirganingiz uchun rahmat. «{test}» lavozimi bo‘yicha saralash doirasida sizdan qisqa onlayn ingliz tili testini topshirishingizni so‘raymiz.\n\nShaxsiy havolangiz: {link}\n\nTest {minutes} daqiqagacha davom etadi va bir o‘tirishda topshiriladi, shuning uchun tinch joyni tanlang. Telefondan ham bo‘ladi, ammo kompyuterda qulayroq.{closes_line}\n\nHurmat bilan,\n{company}',
    },
  },
  reminder: {
    en: {
      subject: 'Reminder: English test for {test}',
      body: 'Dear {name},\n\nA short reminder that your English test for {test} at {company} is still waiting for you.\n\nYour personal link: {link}\n\nIt takes up to {minutes} minutes.{closes_line}\n\nKind regards,\n{company}',
    },
    ru: {
      subject: 'Напоминание: тест по английскому, {test}',
      body: 'Здравствуйте, {name}!\n\nНапоминаем, что ваш тест по английскому для позиции «{test}» в {company} ещё не пройден.\n\nВаша личная ссылка: {link}\n\nОн занимает до {minutes} мин.{closes_line}\n\nС уважением,\n{company}',
    },
    uz: {
      subject: 'Eslatma: ingliz tili testi, {test}',
      body: 'Assalomu alaykum, {name}!\n\n{company} kompaniyasidagi «{test}» lavozimi uchun ingliz tili testingiz hali topshirilmaganini eslatamiz.\n\nShaxsiy havolangiz: {link}\n\nTest {minutes} daqiqagacha davom etadi.{closes_line}\n\nHurmat bilan,\n{company}',
    },
  },
  interview: {
    en: {
      subject: 'Interview invitation: {test} at {company}',
      body: 'Dear {name},\n\nThank you for completing the English test. We would like to invite you to an interview for {test}.\n\nPlease tell us which days and times suit you this week, and we will confirm the details.\n\nKind regards,\n{company}',
    },
    ru: {
      subject: 'Приглашение на собеседование: {test}, {company}',
      body: 'Здравствуйте, {name}!\n\nСпасибо, что прошли тест по английскому. Мы хотели бы пригласить вас на собеседование на позицию «{test}».\n\nНапишите, пожалуйста, какие дни и время на этой неделе вам подходят, и мы подтвердим детали.\n\nС уважением,\n{company}',
    },
    uz: {
      subject: 'Suhbatga taklif: {test}, {company}',
      body: 'Assalomu alaykum, {name}!\n\nIngliz tili testini topshirganingiz uchun rahmat. Sizni «{test}» lavozimi bo‘yicha suhbatga taklif qilmoqchimiz.\n\nIltimos, shu haftada qaysi kun va vaqt sizga qulayligini yozing, biz tafsilotlarni tasdiqlaymiz.\n\nHurmat bilan,\n{company}',
    },
  },
  offer: {
    en: {
      subject: 'Job offer: {test} at {company}',
      body: 'Dear {name},\n\nWe are pleased to offer you the position of {test} at {company}.\n\nPlease reply to confirm that you are interested, and we will send you the terms and the next steps.\n\nKind regards,\n{company}',
    },
    ru: {
      subject: 'Предложение о работе: {test}, {company}',
      body: 'Здравствуйте, {name}!\n\nМы рады предложить вам позицию «{test}» в {company}.\n\nПожалуйста, подтвердите ответом свою заинтересованность, и мы пришлём условия и следующие шаги.\n\nС уважением,\n{company}',
    },
    uz: {
      subject: 'Ish taklifi: {test}, {company}',
      body: 'Assalomu alaykum, {name}!\n\nSizga {company} kompaniyasida «{test}» lavozimini taklif qilishdan mamnunmiz.\n\nIltimos, qiziqishingizni javob bilan tasdiqlang, biz sizga shartlar va keyingi qadamlarni yuboramiz.\n\nHurmat bilan,\n{company}',
    },
  },
  rejection: {
    en: {
      subject: 'Your application: {test} at {company}',
      body: 'Dear {name},\n\nThank you for your time and for taking the English test. After reviewing the applications for {test}, we have decided not to move forward with your application at this time.\n\nThis decision is about this particular role and its requirements. We wish you every success.\n\nKind regards,\n{company}',
    },
    ru: {
      subject: 'Ваша заявка: {test}, {company}',
      body: 'Здравствуйте, {name}!\n\nСпасибо за уделённое время и за прохождение теста по английскому. Рассмотрев заявки на позицию «{test}», мы решили пока не продолжать работу с вашей кандидатурой.\n\nЭто решение касается именно этой позиции и её требований. Желаем вам успехов.\n\nС уважением,\n{company}',
    },
    uz: {
      subject: 'Arizangiz: {test}, {company}',
      body: 'Assalomu alaykum, {name}!\n\nVaqt ajratganingiz va ingliz tili testini topshirganingiz uchun rahmat. «{test}» lavozimiga kelgan arizalarni ko‘rib chiqib, hozircha nomzodingiz bilan davom etmaslikka qaror qildik.\n\nBu qaror aynan shu lavozim va uning talablariga oid. Sizga omad tilaymiz.\n\nHurmat bilan,\n{company}',
    },
  },
  feedback: {
    en: {
      subject: 'Your English test feedback from {company}',
      body: 'Dear {name},\n\nThank you for taking the English test for {test}. Here is your personal feedback report: {link}\n\nThe levels in it are Schood estimates on the CEFR scale, not an official certificate.\n\nKind regards,\n{company}',
    },
    ru: {
      subject: 'Результаты вашего теста по английскому от {company}',
      body: 'Здравствуйте, {name}!\n\nСпасибо, что прошли тест по английскому для позиции «{test}». Вот ваш личный отчёт с обратной связью: {link}\n\nУровни в нём — оценка Schood по шкале CEFR, а не официальный сертификат.\n\nС уважением,\n{company}',
    },
    uz: {
      subject: '{company} dan ingliz tili testi natijalari',
      body: 'Assalomu alaykum, {name}!\n\n«{test}» uchun ingliz tili testini topshirganingiz uchun rahmat. Mana shaxsiy hisobotingiz: {link}\n\nUndagi darajalar CEFR shkalasi bo‘yicha Schood bahosi bo‘lib, rasmiy sertifikat emas.\n\nHurmat bilan,\n{company}',
    },
  },
};

const CLOSES: Record<MessageLocale, string> = {
  en: '\n\nPlease finish it by {closes}.',
  ru: '\n\nПожалуйста, пройдите его до {closes}.',
  uz: '\n\nIltimos, uni {closes} gacha topshiring.',
};

/** A day in Tashkent, written the same way in every language so nothing depends on browser locale data. */
function day(iso: string): string {
  const local = new Date(new Date(iso).getTime() + 5 * 3_600_000);
  return `${String(local.getUTCDate()).padStart(2, '0')}.${String(local.getUTCMonth() + 1).padStart(2, '0')}.${local.getUTCFullYear()}`;
}

export interface MessageValues { name: string | null; company: string; test: string; link?: string | null; minutes: number; closes_at?: string | null }

/** One pass over the template, so a value containing "{link}" stays as typed. */
export function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{([a-z_]+)\}/g, (whole, name) => name in values ? values[name] : whole);
}

export function renderMessage(kind: MessageKind, locale: MessageLocale, values: MessageValues, custom: CustomTemplates = {}): { subject: string; text: string; custom: boolean } {
  const own = custom[kind]?.[locale];
  const template = own ?? DEFAULT_TEMPLATES[kind][locale];
  const closes = values.closes_at ? day(values.closes_at) : '';
  const data: Record<string, string> = {
    name: values.name ?? '', company: values.company, test: values.test, link: values.link ?? '', minutes: String(values.minutes), closes,
    closes_line: closes ? fill(CLOSES[locale], { closes }) : '',
  };
  return { subject: fill(template.subject, data), text: fill(template.body, data), custom: Boolean(own) };
}

/** Reads the templates a workspace saved; an empty entry goes back to the default. */
export function readTemplates(value: unknown): CustomTemplates {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new CompanyError('invalid_field', 'templates must be an object.', 400, { field: 'templates' });
  const out: CustomTemplates = {};
  for (const kind of MESSAGE_KINDS) {
    const perLocale = (value as Record<string, unknown>)[kind];
    if (!perLocale || typeof perLocale !== 'object') continue;
    for (const locale of MESSAGE_LOCALES) {
      const entry = (perLocale as Record<string, unknown>)[locale] as Record<string, unknown> | null | undefined;
      if (!entry || typeof entry !== 'object') continue;
      const subject = text(entry.subject, 'subject', { max: 200, optional: true });
      const body = text(entry.body, 'body', { max: 3000, optional: true });
      if (!subject && !body) continue;
      if (!subject || !body) throw new CompanyError('invalid_field', 'A template needs both a subject and a text.', 400, { field: 'templates' });
      (out[kind] ??= {})[locale] = { subject, body };
    }
  }
  return out;
}

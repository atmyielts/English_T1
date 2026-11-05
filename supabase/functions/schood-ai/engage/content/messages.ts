import type { Locale } from '../../types.ts';
import { fill, type L } from './text.ts';

// The messages the engagement layer sends (Telegram) or shows (web inbox). Every
// number in them is the person's real progress; nothing says "last chance" or
// counts down to a fake deadline. Each message has one honest button and the
// person can switch messages off in one tap (/progress/settings).

export type MessageKind =
  | 'checkin_soon' | 'checkin_after' | 'certificate_ready' | 'streak_risk' | 'comeback_open' | 'journey_risk'
  | 'winback_2' | 'winback_7' | 'winback_21' | 'squad_nudge' | 'league_result' | 'event_mock';

/** Higher goes first when the daily limit allows only one or two. */
export const PRIORITY: Record<MessageKind, number> = {
  checkin_soon: 90, certificate_ready: 85, streak_risk: 80, comeback_open: 75, journey_risk: 70,
  winback_2: 65, winback_7: 64, winback_21: 63, checkin_after: 60, squad_nudge: 50, league_result: 40, event_mock: 30,
};
/**
 * The kind each message is sent as (registerNotifyKind), so people can mute it in Settings →
 * Notifications; muting "engage" mutes them all.
 */
export const NOTIFY_KIND: Record<MessageKind, string> = {
  checkin_soon: 'engage.checkin', checkin_after: 'engage.checkin', certificate_ready: 'engage.certificate', streak_risk: 'engage.streak',
  comeback_open: 'engage.streak', journey_risk: 'engage.journey', winback_2: 'engage.winback', winback_7: 'engage.winback', winback_21: 'engage.winback',
  squad_nudge: 'engage.squad', league_result: 'engage.league', event_mock: 'engage.events',
};
export const NOTIFY_LABELS: Record<string, L> = {
  'engage.checkin': { en: 'Reminders before and after your dates', uz: 'Sanalaringizdan oldin va keyin eslatmalar', ru: 'Напоминания до и после ваших дат' },
  'engage.streak': { en: 'Streak reminders', uz: 'Seriya eslatmalari', ru: 'Напоминания о серии' },
  'engage.journey': { en: 'Programme chapters behind schedule', uz: 'Rejadan ortda qolgan dastur boblari', ru: 'Отставание по главам программы' },
  'engage.winback': { en: 'Messages after a break', uz: 'Tanaffusdan keyingi xabarlar', ru: 'Сообщения после перерыва' },
  'engage.squad': { en: 'Hellos from your squad', uz: 'Jamoangizdan salomlar', ru: 'Приветы от вашей команды' },
  'engage.league': { en: 'Weekly league results', uz: 'Haftalik liga natijalari', ru: 'Итоги недельной лиги' },
  'engage.events': { en: 'The weekend national mock', uz: 'Dam olish kunlaridagi milliy sinov', ru: 'Национальный пробный тест по выходным' },
  'engage.certificate': { en: 'Skill Certificate results', uz: 'Ko‘nikma sertifikati natijalari', ru: 'Результаты сертификатов навыков' },
};

interface Template { text: L; button: L; path: string }
const T: Record<MessageKind, Template> = {
  checkin_soon: {
    text: { en: 'Your {kind} "{title}" is {when}. A {minutes}-minute rehearsal tonight?', uz: '"{title}" ({kind}) {when}. Bugun kechqurun {minutes} daqiqalik mashq qilamizmi?', ru: '«{title}» ({kind}) — {when}. Репетиция на {minutes} минут сегодня вечером?' },
    button: { en: 'Rehearse now', uz: 'Hozir mashq qilish', ru: 'Репетировать сейчас' }, path: '{link}',
  },
  checkin_after: {
    text: { en: 'How did "{title}" go? Add your result, and your next goal will be ready.', uz: '"{title}" qanday o‘tdi? Natijangizni qo‘shing, keyingi maqsadingiz tayyor bo‘ladi.', ru: 'Как прошло «{title}»? Добавьте результат, и следующая цель будет готова.' },
    button: { en: 'Add my result', uz: 'Natijani qo‘shish', ru: 'Добавить результат' }, path: '/progress/coach',
  },
  certificate_ready: {
    text: { en: 'Your {exam} result is ready.', uz: '{exam} natijangiz tayyor.', ru: 'Результат {exam} готов.' },
    button: { en: 'See the result', uz: 'Natijani ko‘rish', ru: 'Посмотреть результат' }, path: '/certificates',
  },
  streak_risk: {
    text: { en: 'Your {streak}-day streak: one short step today keeps it. {freeze_line}', uz: '{streak} kunlik seriyangiz: bugun bitta qisqa qadam uni saqlab qoladi. {freeze_line}', ru: 'Ваша серия — {streak} дн.: один короткий шаг сегодня её сохранит. {freeze_line}' },
    button: { en: 'Today’s first step', uz: 'Bugungi birinchi qadam', ru: 'Первый шаг на сегодня' }, path: '/progress',
  },
  comeback_open: {
    text: { en: 'Your {old}-day streak can come back: {left} more learning activities by {date}, and it is restored.', uz: '{old} kunlik seriyangiz qaytishi mumkin: {date} gacha yana {left} ta mashg‘ulot, va u tiklanadi.', ru: 'Серию в {old} дн. можно вернуть: ещё {left} занятия до {date} — и она восстановится.' },
    button: { en: 'Win it back', uz: 'Qaytarib olish', ru: 'Вернуть серию' }, path: '/progress',
  },
  journey_risk: {
    text: { en: '{journey}, chapter {chapter}: {left} tasks left this week. You have done {done} of {total}.', uz: '{journey}, {chapter}-bob: bu hafta {left} ta vazifa qoldi. {total} tadan {done} tasini bajardingiz.', ru: '{journey}, глава {chapter}: на этой неделе осталось заданий: {left}. Сделано {done} из {total}.' },
    button: { en: 'Open the chapter', uz: 'Bobni ochish', ru: 'Открыть главу' }, path: '/journeys/{journey_key}',
  },
  winback_2: {
    text: { en: 'You have {xp} XP and {days} learning days on Schood. Today’s story episode takes about {minutes} minutes.', uz: 'Schood’da {xp} XP va {days} kunlik o‘qishingiz bor. Bugungi hikoya qismi taxminan {minutes} daqiqa oladi.', ru: 'У вас {xp} XP и {days} дней занятий на Schood. Сегодняшний эпизод займёт около {minutes} минут.' },
    button: { en: 'Read today’s episode', uz: 'Bugungi qismni o‘qish', ru: 'Читать эпизод' }, path: '/stories',
  },
  winback_7: {
    text: { en: 'It has been a week. Your progress is saved: {progress_line} Pick up where you stopped, at your own pace.', uz: 'Bir hafta o‘tdi. Natijalaringiz saqlangan: {progress_line} To‘xtagan joyingizdan, o‘z sur’atingizda davom eting.', ru: 'Прошла неделя. Ваш прогресс сохранён: {progress_line} Продолжайте с того места, где остановились, в своём темпе.' },
    button: { en: 'Continue', uz: 'Davom etish', ru: 'Продолжить' }, path: '/progress',
  },
  winback_21: {
    text: { en: 'Your Schood record is still here: {progress_line} This is the last reminder; you can come back any time.', uz: 'Schood’dagi natijalaringiz joyida: {progress_line} Bu oxirgi eslatma; istalgan vaqtda qaytishingiz mumkin.', ru: 'Ваши результаты на Schood на месте: {progress_line} Это последнее напоминание; возвращайтесь в любое время.' },
    button: { en: 'See my progress', uz: 'Natijalarimni ko‘rish', ru: 'Мой прогресс' }, path: '/progress',
  },
  squad_nudge: {
    text: { en: '{name} from {squad} says hi: the squad has {minutes} of {goal} minutes this week.', uz: '{squad} jamoasidan {name} salom yo‘lladi: jamoa bu hafta {goal} daqiqadan {minutes} daqiqa to‘pladi.', ru: '{name} из «{squad}» передаёт привет: у команды {minutes} из {goal} минут на этой неделе.' },
    button: { en: 'Open the squad', uz: 'Jamoani ochish', ru: 'Открыть команду' }, path: '/squads',
  },
  league_result: {
    text: { en: 'Last week you finished {rank} in the {tier} league with {xp} XP: {outcome}.', uz: 'O‘tgan hafta {tier} ligasida {xp} XP bilan {rank}-o‘rinni egalladingiz: {outcome}.', ru: 'На прошлой неделе вы заняли {rank}-е место в лиге «{tier}» с {xp} XP: {outcome}.' },
    button: { en: 'See this week’s league', uz: 'Bu haftalik liga', ru: 'Лига этой недели' }, path: '/league',
  },
  event_mock: {
    text: { en: 'The weekly national mock is open until Sunday 22:00.', uz: 'Haftalik milliy sinov yakshanba 22:00 gacha ochiq.', ru: 'Еженедельный национальный пробник открыт до воскресенья, 22:00.' },
    button: { en: 'Take the mock', uz: 'Sinovni topshirish', ru: 'Пройти пробник' }, path: '/coach/b1',
  },
};

export const WORDS: Record<string, L> = {
  exam: { en: 'exam', uz: 'imtihon', ru: 'экзамен' },
  interview: { en: 'interview', uz: 'suhbat', ru: 'собеседование' },
  deadline: { en: 'deadline', uz: 'muddat', ru: 'дедлайн' },
  presentation: { en: 'presentation', uz: 'taqdimot', ru: 'выступление' },
  other: { en: 'date', uz: 'sana', ru: 'событие' },
  today: { en: 'today', uz: 'bugun', ru: 'сегодня' },
  tomorrow: { en: 'tomorrow', uz: 'ertaga', ru: 'завтра' },
  in_days: { en: 'in {days} days', uz: '{days} kundan keyin', ru: 'через {days} дн.' },
  freeze_held: { en: 'You also hold {count} streak freeze(s), used automatically if you miss a day.', uz: 'Sizda yana {count} ta seriya muzlatgichi bor, bir kun o‘tkazib yuborsangiz avtomatik ishlatiladi.', ru: 'У вас есть заморозки серии ({count}); они срабатывают сами, если пропустить день.' },
  freeze_none: { en: '', uz: '', ru: '' },
  progress: { en: '{xp} XP, a {longest}-day best streak{journey}.', uz: '{xp} XP, eng uzun seriya {longest} kun{journey}.', ru: '{xp} XP, лучшая серия {longest} дн.{journey}.' },
  progress_journey: { en: ', chapter {chapter} of {journey}', uz: ', {journey}: {chapter}-bob', ru: ', {journey}: глава {chapter}' },
  promoted: { en: 'you move up', uz: 'siz yuqoriga ko‘tarilasiz', ru: 'вы поднимаетесь' },
  stayed: { en: 'you stay in this league', uz: 'shu ligada qolasiz', ru: 'вы остаётесь в этой лиге' },
  demoted: { en: 'you move down one league', uz: 'bir liga pastga tushasiz', ru: 'вы опускаетесь на одну лигу' },
  bronze: { en: 'Bronze', uz: 'Bronza', ru: 'Бронза' }, silver: { en: 'Silver', uz: 'Kumush', ru: 'Серебро' }, gold: { en: 'Gold', uz: 'Oltin', ru: 'Золото' },
  sapphire: { en: 'Sapphire', uz: 'Sapfir', ru: 'Сапфир' }, diamond: { en: 'Diamond', uz: 'Olmos', ru: 'Алмаз' },
};
export const word = (key: string, locale: Locale, params: Record<string, string | number> = {}) => fill(WORDS[key]?.[locale] ?? WORDS[key]?.en ?? key, params);

/** The finished message: text and one button, in the person's language. */
export function message(kind: MessageKind, locale: Locale, params: Record<string, string | number>): { text: string; buttons: { label: string; path: string }[] } {
  const template = T[kind];
  const text = fill(template.text[locale] || template.text.en, params).replace(/\s+/g, ' ').trim();
  const path = fill(template.path, params);
  return { text, buttons: [{ label: template.button[locale] || template.button.en, path: path.startsWith('/') ? path : '/progress' }] };
}

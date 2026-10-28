import { useCallback, useMemo } from 'react';
import { I18N_STORAGE_KEY, useI18n, type LocaleCode } from '../../../i18n';

// Strings for the English section of the Telegram Mini App, in the platform's
// three locales. Kept beside the component (not in the big locale files) so
// the Mini App and the platform can change independently.

const en = {
  'tab': 'English',
  'eyebrow': 'Schood English',
  'loading': 'Loading your English…',
  'error.title': 'English did not load',
  'error.retry': 'Try again',
  'streak': 'Day streak',
  'xpToday': 'XP today',
  'level': 'Level',
  'level.none': '—',
  'placement.title': 'Find your level first',
  'placement.body': 'A free 15-minute test sets your level and builds a daily plan for you.',
  'placement.cta': 'Take the free level test',
  'review.title': 'Review',
  'review.due': '{count} cards are due: missed questions and saved words.',
  'review.dueOne': '1 card is due.',
  'review.none': 'Nothing to review right now. New cards appear as you practise.',
  'review.cta': 'Review now',
  'next.title': 'Next up',
  'next.progress': '{done} of {total} done today',
  'next.noPlan': "Open English once today to build today's plan.",
  'next.openToday': "Open today's plan",
  'next.allDone': 'All done for today. Great work!',
  'next.minutes': '{minutes} min',
  'next.reviewTask': 'Review due cards',
  'next.start': 'Start',
  'openApp': 'Open the full English app',
  'skill.reading': 'Reading',
  'skill.writing': 'Writing',
  'skill.listening': 'Listening',
  'skill.speaking': 'Speaking',
  'skill.grammar': 'Grammar',
  'skill.vocabulary': 'Vocabulary',
  'skill.immersion': 'Immersion',
  'rv.back': 'Back',
  'rv.progress': 'Card {current} · {correct} correct so far',
  'rv.from': 'From: {source}',
  'rv.yourAnswer': 'Your answer',
  'rv.check': 'Check',
  'rv.skip': 'Skip',
  'rv.next': 'Next',
  'rv.correct': 'Correct!',
  'rv.wrong': 'Not quite.',
  'rv.expected': 'Answer: {answer}',
  'rv.accuracy': 'Accuracy: {accuracy}%',
  'rv.listen': 'Play the sentence',
  'rv.dictation': 'Listen and type the sentence.',
  'rv.noAudio': 'Audio does not play here. Skip this card or do it in the English app.',
  'rv.word': 'Saved word',
  'rv.recall': 'Do you remember what it means?',
  'rv.reveal': 'Show meaning',
  'rv.noDefinition': 'No definition saved for this word.',
  'rv.again': 'Again',
  'rv.gotIt': 'Got it',
  'rv.saveError': 'Your answer was not saved. Try again.',
  'rv.done.title': 'Review done',
  'rv.done.body': '{correct} of {total} correct. Your next cards come back on schedule.',
  'rv.done.empty': 'Nothing is due right now.',
  'rv.done.back': 'Back to English',
  'rv.done.score': 'Score',
  'rv.done.xp': '+{xp} XP',
  'rv.done.saved': 'Cards you missed come back sooner, here and in the English app.',
  'rv.done.next': 'See what to do next',
  'rv.done.journey': 'Your journey',
} as const;

export type TgEnglishKey = keyof typeof en;
type Dictionary = Record<TgEnglishKey, string>;

const ru: Dictionary = {
  'tab': 'English',
  'eyebrow': 'Schood English',
  'loading': 'Загружаем ваш английский…',
  'error.title': 'Не удалось загрузить English',
  'error.retry': 'Повторить',
  'streak': 'Дней подряд',
  'xpToday': 'XP сегодня',
  'level': 'Уровень',
  'level.none': '—',
  'placement.title': 'Сначала узнайте свой уровень',
  'placement.body': 'Бесплатный 15-минутный тест определит уровень и составит план на каждый день.',
  'placement.cta': 'Пройти бесплатный тест',
  'review.title': 'Повторение',
  'review.due': 'К повторению: {count} — пропущенные вопросы и сохранённые слова.',
  'review.dueOne': 'К повторению: 1 карточка.',
  'review.none': 'Сейчас повторять нечего. Новые карточки появятся по мере занятий.',
  'review.cta': 'Повторить сейчас',
  'next.title': 'Дальше',
  'next.progress': 'Сегодня выполнено {done} из {total}',
  'next.noPlan': 'Откройте English сегодня, чтобы составить план на день.',
  'next.openToday': 'Открыть план на сегодня',
  'next.allDone': 'На сегодня всё. Отличная работа!',
  'next.minutes': '{minutes} мин',
  'next.reviewTask': 'Повторить карточки',
  'next.start': 'Начать',
  'openApp': 'Открыть полное приложение English',
  'skill.reading': 'Чтение',
  'skill.writing': 'Письмо',
  'skill.listening': 'Аудирование',
  'skill.speaking': 'Говорение',
  'skill.grammar': 'Грамматика',
  'skill.vocabulary': 'Лексика',
  'skill.immersion': 'Погружение',
  'rv.back': 'Назад',
  'rv.progress': 'Карточка {current} · верно: {correct}',
  'rv.from': 'Из: {source}',
  'rv.yourAnswer': 'Ваш ответ',
  'rv.check': 'Проверить',
  'rv.skip': 'Пропустить',
  'rv.next': 'Дальше',
  'rv.correct': 'Верно!',
  'rv.wrong': 'Не совсем.',
  'rv.expected': 'Ответ: {answer}',
  'rv.accuracy': 'Точность: {accuracy}%',
  'rv.listen': 'Прослушать предложение',
  'rv.dictation': 'Прослушайте и напишите предложение.',
  'rv.noAudio': 'Здесь не воспроизводится звук. Пропустите карточку или выполните её в приложении English.',
  'rv.word': 'Сохранённое слово',
  'rv.recall': 'Помните, что оно значит?',
  'rv.reveal': 'Показать значение',
  'rv.noDefinition': 'Для этого слова нет сохранённого значения.',
  'rv.again': 'Ещё раз',
  'rv.gotIt': 'Помню',
  'rv.saveError': 'Ответ не сохранился. Попробуйте ещё раз.',
  'rv.done.title': 'Повторение завершено',
  'rv.done.body': 'Верно {correct} из {total}. Следующие карточки вернутся по расписанию.',
  'rv.done.empty': 'Сейчас повторять нечего.',
  'rv.done.back': 'Назад в English',
  'rv.done.score': 'Результат',
  'rv.done.xp': '+{xp} XP',
  'rv.done.saved': 'Карточки с ошибками вернутся раньше, здесь и в приложении English.',
  'rv.done.next': 'Что делать дальше',
  'rv.done.journey': 'Ваш путь',
};

const uz: Dictionary = {
  'tab': 'English',
  'eyebrow': 'Schood English',
  'loading': 'Ingliz tilingiz yuklanmoqda…',
  'error.title': 'English yuklanmadi',
  'error.retry': 'Qayta urinish',
  'streak': 'Ketma-ket kun',
  'xpToday': 'Bugungi XP',
  'level': 'Daraja',
  'level.none': '—',
  'placement.title': 'Avval darajangizni aniqlang',
  'placement.body': '15 daqiqalik bepul test darajangizni aniqlaydi va kunlik reja tuzadi.',
  'placement.cta': 'Bepul daraja testidan oʻtish',
  'review.title': 'Takrorlash',
  'review.due': 'Takrorlash uchun {count} ta karta: xato savollar va saqlangan soʻzlar.',
  'review.dueOne': 'Takrorlash uchun 1 ta karta.',
  'review.none': 'Hozircha takrorlash yoʻq. Mashq qilganingiz sari yangi kartalar paydo boʻladi.',
  'review.cta': 'Hozir takrorlash',
  'next.title': 'Keyingisi',
  'next.progress': 'Bugun {total} tadan {done} tasi bajarildi',
  'next.noPlan': 'Bugungi rejani tuzish uchun English ni bir marta oching.',
  'next.openToday': 'Bugungi rejani ochish',
  'next.allDone': 'Bugungi hammasi bajarildi. Barakalla!',
  'next.minutes': '{minutes} daq',
  'next.reviewTask': 'Kartalarni takrorlash',
  'next.start': 'Boshlash',
  'openApp': 'English ilovasini toʻliq ochish',
  'skill.reading': 'Oʻqish',
  'skill.writing': 'Yozish',
  'skill.listening': 'Tinglash',
  'skill.speaking': 'Gapirish',
  'skill.grammar': 'Grammatika',
  'skill.vocabulary': 'Lugʻat',
  'skill.immersion': 'Immersiya',
  'rv.back': 'Orqaga',
  'rv.progress': '{current}-karta · {correct} ta toʻgʻri',
  'rv.from': 'Manba: {source}',
  'rv.yourAnswer': 'Javobingiz',
  'rv.check': 'Tekshirish',
  'rv.skip': 'Oʻtkazib yuborish',
  'rv.next': 'Keyingisi',
  'rv.correct': 'Toʻgʻri!',
  'rv.wrong': 'Unchalik emas.',
  'rv.expected': 'Javob: {answer}',
  'rv.accuracy': 'Aniqlik: {accuracy}%',
  'rv.listen': 'Gapni tinglash',
  'rv.dictation': 'Tinglang va gapni yozing.',
  'rv.noAudio': 'Bu yerda ovoz ijro etilmaydi. Kartani oʻtkazib yuboring yoki English ilovasida bajaring.',
  'rv.word': 'Saqlangan soʻz',
  'rv.recall': 'Maʼnosini eslaysizmi?',
  'rv.reveal': 'Maʼnosini koʻrsatish',
  'rv.noDefinition': 'Bu soʻz uchun maʼno saqlanmagan.',
  'rv.again': 'Yana',
  'rv.gotIt': 'Eslayman',
  'rv.saveError': 'Javob saqlanmadi. Qayta urinib koʻring.',
  'rv.done.title': 'Takrorlash tugadi',
  'rv.done.body': '{total} tadan {correct} tasi toʻgʻri. Keyingi kartalar oʻz vaqtida qaytadi.',
  'rv.done.empty': 'Hozircha takrorlash yoʻq.',
  'rv.done.back': 'English ga qaytish',
  'rv.done.score': 'Natija',
  'rv.done.xp': '+{xp} XP',
  'rv.done.saved': 'Xato qilingan kartalar bu yerda ham, English ilovasida ham tezroq qaytadi.',
  'rv.done.next': 'Keyin nima qilish kerak',
  'rv.done.journey': 'Sizning yoʻlingiz',
};

const dictionaries: Record<LocaleCode, Dictionary> = { en, ru, uz };

type TelegramLanguageWindow = { Telegram?: { WebApp?: { initDataUnsafe?: { user?: { language_code?: string } } } } };

const telegramLocale = (): LocaleCode | null => {
  const code = String((window as unknown as TelegramLanguageWindow).Telegram?.WebApp?.initDataUnsafe?.user?.language_code ?? '').toLowerCase();
  if (code.startsWith('ru')) return 'ru';
  if (code.startsWith('uz')) return 'uz';
  return code ? 'en' : null;
};

const hasStoredLocale = (): boolean => {
  try {
    return Boolean(window.localStorage.getItem(I18N_STORAGE_KEY));
  } catch {
    return false;
  }
};

/**
 * The platform locale when the learner chose one; otherwise Telegram's
 * interface language, so a first-time Mini App user is not shown English by default.
 */
export const useTgEnglishT = () => {
  const { locale } = useI18n();
  const active = useMemo<LocaleCode>(() => (hasStoredLocale() ? locale : telegramLocale() ?? locale), [locale]);
  const t = useCallback((key: TgEnglishKey, params?: Record<string, string | number>) => {
    const template = dictionaries[active][key] ?? en[key];
    return params ? template.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? '')) : template;
  }, [active]);
  return { t, locale: active };
};

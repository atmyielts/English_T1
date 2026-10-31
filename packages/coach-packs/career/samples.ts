import { T } from '../src/localize.ts';
import type { Localized, Sample } from '../src/types.ts';

// Static example reports for people without a plan, clearly labelled as examples of
// fictional learners. Practice text (tasks, quotes, better lines) is in all three
// languages; the Mini App shows the learner's.

const L = (en: string, uz: string, ru: string): Localized => ({ en, uz, ru });
const t = (en: string, uz: string, ru: string) => T({ en, uz, ru });

export const samples: Sample[] = [
  {
    id: 'sample-interview-answer', kind: 'speaking_report',
    title: L('Example: a scored interview answer', 'Namuna: baholangan suhbat javobi', 'Пример: оценённый ответ на собеседовании'),
    preview: L(
      'Malika (fictional) answered "Tell me about a time you dealt with an angry customer" by voice. L3+ overall: a clear story and a calm tone, but the result was vague. The coach quoted her own words, measured 118 words and 4 fillers a minute, and gave a stronger ending to re-record.',
      'Malika (to‘qima o‘quvchi) «Jahli chiqqan mijoz bilan ishlagan holatingiz haqida gapiring» savoliga ovozda javob berdi. Umumiy L3+: aniq hikoya va xotirjam ohang, lekin natija noaniq. Murabbiy uning o‘z so‘zlaridan iqtibos keltirdi, daqiqasiga 118 so‘z va 4 ta to‘ldiruvchi so‘zni qayd etdi hamda qayta yozib olish uchun kuchliroq yakun taklif qildi.',
      'Малика (вымышленная ученица) голосом ответила на вопрос «Расскажите о случае с рассерженным клиентом». Итог L3+: ясная история и спокойный тон, но размытый результат. Коуч процитировал её слова, насчитал 118 слов и 4 слова-паразита в минуту и предложил более сильный финал для перезаписи.',
    ),
    body: {
      task: t('Behavioural question for a bank customer service role: "Tell me about a time you dealt with an angry customer."', 'Bankda mijozlarga xizmat ko‘rsatish lavozimi uchun xulq-atvor savoli: «Jahli chiqqan mijoz bilan ishlagan holatingiz haqida gapiring.»', 'Поведенческий вопрос на роль специалиста по обслуживанию в банке: «Расскажите о случае, когда вы имели дело с рассерженным клиентом».'),
      overall: 3.5,
      criteria: [
        { id: 'structure', score: 3.5, evidence: [t('Last winter a customer came in because his card was blocked', 'O‘tgan qishda kartasi bloklangan mijoz keldi', 'Прошлой зимой пришёл клиент, у которого заблокировали карту')], note: L('Situation, task and actions are in order; the result is one vague line.', 'Vaziyat, vazifa va harakatlar tartibli; natija bitta noaniq qator.', 'Ситуация, задача и действия по порядку; результат — одна размытая строка.') },
        { id: 'relevance', score: 4, evidence: [t('I checked the reason in the system and explained it calmly', 'Sababini tizimdan tekshirib, xotirjam tushuntirdim', 'Я проверила причину в системе и спокойно объяснила')], note: L('A banking situation, exactly what the role needs.', 'Bank vaziyati — lavozimga aynan kerak narsa.', 'Банковская ситуация — именно то, что нужно для роли.') },
        { id: 'evidence', score: 3, evidence: [t('In the end he was happy', 'Oxiri u mamnun bo‘ldi', 'В итоге он остался доволен')], note: L('The ending needs a concrete outcome.', 'Yakunga aniq natija kerak.', 'Финалу нужен конкретный итог.') },
        { id: 'clarity', score: 3.5, evidence: [t('ee, so I asked him to sit down', 'ee, keyin undan o‘tirishni so‘radim', 'ну, и я попросила его присесть')], note: L('Clear, with a few fillers; pace comfortable.', 'Aniq, to‘ldiruvchi so‘zlar kam; sur’at qulay.', 'Ясно, слов-паразитов немного; темп комфортный.') },
        { id: 'language', score: 3.5, evidence: [t('I apologised for the inconvenience', 'Noqulaylik uchun uzr so‘radim', 'Я извинилась за неудобства')], note: L('Polite and professional.', 'Xushmuomala va professional.', 'Вежливо и профессионально.') },
      ],
      metrics: { wpm: 118, fillersPerMinute: 4, longPauses: 1, seconds: 62 },
      upgrades: [
        { said: t('In the end he was happy', 'Oxiri u mamnun bo‘ldi', 'В итоге он остался доволен'), better: t('The card was unblocked within 20 minutes, he thanked me in the feedback form, and he opened a savings account the next week.', 'Karta 20 daqiqada blokdan chiqarildi, u fikr-mulohaza anketasida menga rahmat aytdi, keyingi haftada esa omonat ochdi.', 'Карту разблокировали за 20 минут, он поблагодарил меня в форме отзыва, а через неделю открыл накопительный счёт.'), why: L('A specific outcome proves the skill. Use what really happened.', 'Aniq natija ko‘nikmani isbotlaydi. Haqiqatda nima bo‘lganini ayting.', 'Конкретный итог доказывает навык. Называйте то, что было на самом деле.') },
      ],
    },
  },
  {
    id: 'sample-cv', kind: 'writing_report',
    title: L('Example: a CV section, before and after', 'Namuna: rezyume bo‘limi, oldin va keyin', 'Пример: раздел резюме до и после'),
    preview: L(
      'Jasur (fictional) sent his CV experience section for a logistics coordinator role. L2+: duties instead of results. The coach quoted each weak line, showed how to turn it into an achievement with his own facts, and flagged mixed tenses.',
      'Jasur (to‘qima o‘quvchi) logistika koordinatori lavozimi uchun rezyumesidagi tajriba bo‘limini yubordi. L2+: natijalar o‘rniga vazifalar. Murabbiy har bir zaif qatorni iqtibos keltirdi, uni o‘z faktlari bilan yutuqqa qanday aylantirishni ko‘rsatdi va aralash zamonlarni belgiladi.',
      'Жасур (вымышленный ученик) прислал раздел опыта из резюме на роль координатора логистики. L2+: обязанности вместо результатов. Коуч процитировал каждую слабую строку, показал, как превратить её в достижение на основе его же фактов, и отметил смешение времён.',
    ),
    body: {
      task: t('CV experience section for a logistics coordinator role.', 'Logistika koordinatori lavozimi uchun rezyumening tajriba bo‘limi.', 'Раздел опыта в резюме на роль координатора логистики.'),
      overall: 2.5,
      criteria: [
        { id: 'impact', score: 2, evidence: [t('Responsible for planning routes', 'Yo‘nalishlarni rejalashtirish uchun mas’ul', 'Отвечал за планирование маршрутов')], note: L('Duties only; no result.', 'Faqat vazifalar; natija yo‘q.', 'Только обязанности, результатов нет.') },
        { id: 'tailoring', score: 3, evidence: [t('Worked with drivers and warehouse', 'Haydovchilar va ombor bilan ishladim', 'Работал с водителями и складом')], note: L('Relevant experience, not yet shaped for the posting.', 'Tegishli tajriba, lekin hali e’longa moslashtirilmagan.', 'Опыт релевантный, но пока не адаптирован под вакансию.') },
        { id: 'accuracy', score: 2.5, evidence: [t('Prepare daily reports', 'Kundalik hisobotlar tayyorlayman', 'Готовлю ежедневные отчёты')], note: L('A past job written in the present tense.', 'O‘tgan ish hozirgi zamonda yozilgan.', 'Прошлая работа описана в настоящем времени.') },
      ],
      corrections: [
        { original: t('Responsible for planning routes', 'Yo‘nalishlarni rejalashtirish uchun mas’ul', 'Отвечал за планирование маршрутов'), corrected: t('Planned daily routes for 9 trucks, cutting empty runs by about a fifth', 'Har kuni 9 ta yuk mashinasi uchun yo‘nalishlarni rejalashtirib, bo‘sh qatnovlarni taxminan beshdan bir qismga kamaytirdim', 'Планировал ежедневные маршруты для 9 грузовиков, сократив пустые рейсы примерно на пятую часть'), tag: 'duties_not_achievements', why: L('Action verb, scope and a result — using his own figures.', 'Harakat fe’li, ko‘lam va natija — o‘z raqamlari bilan.', 'Глагол действия, масштаб и результат — с его собственными цифрами.') },
        { original: t('Prepare daily reports', 'Kundalik hisobotlar tayyorlayman', 'Готовлю ежедневные отчёты'), corrected: t('Prepared daily delivery reports for the operations manager', 'Operatsiyalar menejeri uchun kundalik yetkazib berish hisobotlarini tayyorladim', 'Готовил ежедневные отчёты о доставках для операционного менеджера'), tag: 'cv_consistency', why: L('Past tense for a past job.', 'O‘tgan ish uchun o‘tgan zamon.', 'Прошедшее время для прошлой работы.') },
      ],
    },
  },
  {
    id: 'sample-salary', kind: 'roleplay_review',
    title: L('Example: a salary negotiation review', 'Namuna: maosh muzokarasi tahlili', 'Пример: разбор переговоров о зарплате'),
    preview: L(
      'Dilnoza (fictional) negotiated an IT offer of 9 million (practice figures). She thanked HR and gave a reason, handled "this is our range" with a review after probation, but forgot to ask for written terms. The scorecard shows 1/1 objections handled, next step not secured, and better lines to replay.',
      'Dilnoza (to‘qima o‘quvchi) 9 millionlik IT taklifi bo‘yicha muzokara olib bordi (mashq uchun raqamlar). U HR menejeriga rahmat aytdi va sabab keltirdi, «bu bizning diapazonimiz» e’tiroziga sinov muddatidan keyin qayta ko‘rib chiqish bilan javob berdi, lekin shartlarni yozma so‘rashni unutdi. Natijalar kartasi: 1/1 e’tiroz hal qilingan, keyingi qadam kelishilmagan va qayta mashq uchun yaxshiroq iboralar.',
      'Дильноза (вымышленная ученица) обсуждала IT-оффер на 9 млн (учебные цифры). Она поблагодарила HR и привела довод, ответила на «это наша вилка» пересмотром после испытательного срока, но забыла попросить условия в письменном виде. В карточке оценки: отработано возражений — 1 из 1, следующий шаг не закреплён; есть более удачные фразы для повторной попытки.',
    ),
    body: {
      scenario: t('Salary negotiation: a junior QA offer at an IT company, 9 million UZS a month (practice figures).', 'Maosh muzokarasi: IT kompaniyada junior QA lavozimiga taklif, oyiga 9 million so‘m (mashq uchun raqamlar).', 'Переговоры о зарплате: оффер младшего тестировщика в IT-компании, 9 млн сумов в месяц (учебные цифры).'),
      goals: [
        { text: L('Thank them and show you want the job', 'Rahmat ayting va ishni xohlayotganingizni ko‘rsating', 'Поблагодарите и покажите, что хотите эту работу'), met: true, quote: t('Thank you so much, I really want to join the team', 'Katta rahmat, jamoaga qo‘shilishni juda xohlayman', 'Большое спасибо, я очень хочу в команду') },
        { text: L('Counter with a figure and a reason', 'Raqam va asos bilan qarshi taklif bering', 'Назовите встречную цифру с обоснованием'), met: true, quote: t('since I can also write automated tests, I was hoping for ten', 'avtomatlashtirilgan testlarni ham yoza olganim uchun o‘nni kutgan edim', 'поскольку я умею писать и автотесты, я рассчитывала на десять') },
        { text: L('Handle "this is our standard range"', '«Bu bizning standart diapazonimiz» e’tiroziga javob bering', 'Отработайте «это наша стандартная вилка»'), met: true, quote: t('could we agree a review after the probation period', 'sinov muddatidan keyin qayta ko‘rib chiqishni kelishsak bo‘ladimi', 'можем договориться о пересмотре после испытательного срока') },
        { text: L('Agree the terms in writing or a decision date', 'Shartlarni yozma ravishda kelishing yoki qaror sanasini belgilang', 'Закрепите условия письменно или договоритесь о сроке решения'), met: false, quote: null },
      ],
      criteria: [
        { id: 'structure', score: 3.5, evidence: [t('Thank you so much, I really want to join the team', 'Katta rahmat, jamoaga qo‘shilishni juda xohlayman', 'Большое спасибо, я очень хочу в команду')], note: L('Thanks, then the counter, then an alternative: a good order.', 'Avval rahmat, keyin qarshi taklif, so‘ng muqobil: yaxshi tartib.', 'Благодарность, встречное предложение, альтернатива — хороший порядок.') },
        { id: 'evidence', score: 3, evidence: [t('since I can also write automated tests', 'avtomatlashtirilgan testlarni ham yoza olganim uchun', 'поскольку я умею писать и автотесты')], note: L('A real reason; one example of the automation work would make it stronger.', 'Haqiqiy sabab; avtomatlashtirish ishidan bitta misol uni kuchaytiradi.', 'Довод настоящий; пример работы по автоматизации усилил бы его.') },
        { id: 'language', score: 4, evidence: [t('could we agree a review after the probation period', 'sinov muddatidan keyin qayta ko‘rib chiqishni kelishsak bo‘ladimi', 'можем договориться о пересмотре после испытательного срока')], note: L('Polite, calm and confident.', 'Muloyim, xotirjam va ishonchli.', 'Вежливо, спокойно и уверенно.') },
      ],
      scorecard: { talkRatio: 46, questionsAsked: 2, averageTurnWords: 21 },
      betterLines: [
        { said: t('Okay, thank you, I will think', 'Mayli, rahmat, o‘ylab ko‘raman', 'Хорошо, спасибо, я подумаю'), better: t('Thank you — could you send the final terms, including the review after probation, by email so I can confirm by Thursday?', 'Rahmat — yakuniy shartlarni, sinov muddatidan keyingi qayta ko‘rib chiqishni ham qo‘shib, elektron pochtaga yuborsangiz, payshanbagacha tasdiqlayman.', 'Спасибо! Пришлите, пожалуйста, итоговые условия, включая пересмотр после испытательного срока, по почте — я подтвержу до четверга.'), why: L('It secures the next step and the agreement in writing.', 'Bu keyingi qadamni va yozma kelishuvni mustahkamlaydi.', 'Так вы закрепляете следующий шаг и письменные условия.') },
      ],
    },
  },
  {
    id: 'sample-plan', kind: 'plan',
    title: L('Example: a job-search plan week', 'Namuna: ish qidirish rejasining bir haftasi', 'Пример: неделя плана поиска работы'),
    preview: L(
      'A fictional graduate with an interview in five weeks, aiming for L4 at 20 minutes a day: CV and profiles first, daily answer practice, and a Saturday mock interview.',
      'Besh haftadan keyin suhbati bor, kuniga 20 daqiqa shug‘ullanib, L4 darajasiga intilayotgan to‘qima bitiruvchi: avval rezyume va profillar, har kuni javob mashqi va shanba kuni sinov suhbati.',
      'Вымышленный выпускник с собеседованием через пять недель, цель L4 при 20 минутах в день: сначала резюме и профили, ежедневная тренировка ответов и пробное собеседование в субботу.',
    ),
    body: {
      target: 4, weeks: 5,
      days: [
        { day: L('Monday', 'Dushanba', 'Понедельник'), tasks: [L('Lesson: achievements on a CV', 'Dars: rezyumedagi yutuqlar', 'Урок: достижения в резюме'), L('Rewrite five CV lines', 'Rezyumening beshta qatorini qayta yozish', 'Переписать пять строк резюме')] },
        { day: L('Tuesday', 'Seshanba', 'Вторник'), tasks: [L('Interview practice: "Tell me about yourself"', 'Suhbat mashqi: «O‘zingiz haqingizda»', 'Тренировка: «Расскажите о себе»'), L('Drill: STAR results', 'Mashq: STAR natijalari', 'Упражнение: результаты в STAR')] },
        { day: L('Wednesday', 'Chorshanba', 'Среда'), tasks: [L('hh.uz profile: "About me" and key skills', 'hh.uz profili: «O‘zim haqimda» va asosiy ko‘nikmalar', 'Профиль hh.uz: «О себе» и ключевые навыки')] },
        { day: L('Thursday', 'Payshanba', 'Четверг'), tasks: [L('Role-play: HR screening call', 'Rolli o‘yin: dastlabki HR qo‘ng‘irog‘i', 'Ролевая игра: HR-скрининг'), L('Lesson: questions to ask', 'Dars: suhbatdoshga beriladigan savollar', 'Урок: какие вопросы задавать')] },
        { day: L('Friday', 'Juma', 'Пятница'), tasks: [L('Cover letter for a real posting', 'Haqiqiy e’lon uchun motivatsion xat', 'Сопроводительное письмо к реальной вакансии')] },
        { day: L('Saturday', 'Shanba', 'Суббота'), tasks: [L('Full mock interview with a report', 'Hisobotli to‘liq sinov suhbati', 'Полное пробное собеседование с отчётом')] },
      ],
    },
  },
  {
    id: 'sample-week', kind: 'weekly_report',
    title: L('Example: a weekly report', 'Namuna: haftalik hisobot', 'Пример: еженедельный отчёт'),
    preview: L(
      'A fictional learner\'s week: interview answers up from L3 to L3+, fillers per minute down from 6 to 4, CV from L2+ to L3+. Focus for next week: results in STAR answers.',
      'To‘qima o‘quvchining haftasi: suhbat javoblari L3 dan L3+ gacha ko‘tarildi, daqiqasiga to‘ldiruvchi so‘zlar 6 tadan 4 taga kamaydi, rezyume L2+ dan L3+ gacha o‘sdi. Keyingi hafta e’tibori: STAR javoblaridagi natijalar.',
      'Неделя вымышленного ученика: ответы на собеседовании выросли с L3 до L3+, слов-паразитов в минуту стало меньше (с 6 до 4), резюме — с L2+ до L3+. Фокус на следующую неделю: результаты в STAR-ответах.',
    ),
    body: {
      rows: [
        { label: L('Interview answers', 'Suhbatdagi javoblar', 'Ответы на собеседовании'), before: 3, after: 3.5 },
        { label: L('CV and profile', 'Rezyume va profil', 'Резюме и профиль'), before: 2.5, after: 3.5 },
        { label: L('Fillers per minute', 'To‘ldiruvchi so‘zlar (daqiqasiga)', 'Слов-паразитов в минуту'), before: 6, after: 4, lowerIsBetter: true },
        { label: L('Words per minute', 'So‘zlar (daqiqasiga)', 'Слов в минуту'), before: 92, after: 112 },
        { label: L('Minutes practised', 'Mashq daqiqalari', 'Минут практики'), before: 70, after: 125 },
      ],
      minutes: 125, streak: 9,
      focus: [L('End every STAR answer with a concrete result', 'Har bir STAR javobini aniq natija bilan yakunlang', 'Заканчивайте каждый STAR-ответ конкретным результатом'), L('Ask one real question at the end of each interview', 'Har bir suhbat oxirida bitta haqiqiy savol bering', 'В конце каждого собеседования задавайте один настоящий вопрос')],
    },
  },
];

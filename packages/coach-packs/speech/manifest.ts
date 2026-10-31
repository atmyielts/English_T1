import type { LevelScale, PackManifest } from '../src/types.ts';

// B6 Public Speaking Coach. A mixed pack: people practise speaking in their own
// language (Uzbek, Russian or English); every practice text is written in all three
// with T() (src/localize.ts). Skill nodes and error tags are referenced by every other
// file in this pack.
//
// The level scale: L1 (first talks, very nervous) to L5 (a confident speaker who holds
// any room and any question), in half steps. It measures talks practised with the
// coach, not any outside certificate.
//
// Mastery: the structure criterion moves `structure` and engagement moves `content`
// (their leaves only count errors), clarity, flow and language move the `delivery`
// leaves, and Q&A role-plays move `interaction`. Placement seeds the four roots.

export const SPEAKER_SCALE: LevelScale = {
  id: 'speaker_level', min: 1, max: 5, step: 0.5,
  labels: [
    { value: 1, label: 'L1' }, { value: 1.5, label: 'L1+' }, { value: 2, label: 'L2' }, { value: 2.5, label: 'L2+' },
    { value: 3, label: 'L3' }, { value: 3.5, label: 'L3+' }, { value: 4, label: 'L4' }, { value: 4.5, label: 'L4+' }, { value: 5, label: 'L5' },
  ],
};

const tag = (id: string, node: string, drill: string, name: [string, string, string], explain: [string, string, string]) => ({
  id, node, drill, name: { en: name[0], uz: name[1], ru: name[2] }, explain: { en: explain[0], uz: explain[1], ru: explain[2] },
});

export const manifest: PackManifest = {
  id: 'speech',
  feature: 'B6',
  version: '1.0.0',
  name: { en: 'Public Speaking Coach', uz: 'Notiqlik murabbiyi', ru: 'Коуч публичных выступлений' },
  tagline: {
    en: 'Speak to any room with confidence: voice analysis of pace, fillers and pauses, and talks scored for structure.',
    uz: 'Har qanday auditoriya oldida ishonch bilan gapiring: sur’at, to‘ldiruvchi so‘zlar, pauzalar tahlili va tuzilma bahosi.',
    ru: 'Выступайте уверенно перед любой аудиторией: анализ темпа, слов-паразитов, пауз и структуры речи.',
  },
  description: {
    en: 'Send a voice message and get your words per minute, fillers ("ee", "aa", "типа", "anu", "um"), long pauses and pace verdict, plus a score for structure (hook, points, close), clarity, engagement and language with your own words quoted. Drills: elevator pitch, impromptu topics, storytelling, and rehearsing a presentation with audience questions. Weekly progress, level-ups and reminders.',
    uz: 'Ovozli xabar yuboring va daqiqadagi so‘zlar soni, to‘ldiruvchi so‘zlar («ee», «aa», «anu», «типа»), uzun pauzalar hamda sur’at bahosini oling. Tuzilma (kirish, fikrlar, yakun), aniqlik, qiziqarlilik va til so‘zlaringizdan iqtiboslar bilan baholanadi. Mashqlar: elevator pitch, tayyorgarliksiz nutq, hikoya va savol-javobli taqdimot. Haftalik natijalar, yangi darajalar va eslatmalar.',
    ru: 'Отправьте голосовое сообщение и получите: слова в минуту, слова-паразиты («ну», «типа», «э-э», «um»), длинные паузы и оценку темпа, а также баллы за структуру (зацепка, тезисы, финал), ясность, вовлечение и язык с цитатами ваших слов. Упражнения: elevator pitch, импровизация, сторителлинг и репетиция выступления с вопросами зала. Прогресс за неделю, уровни и напоминания.',
  },
  uiLanguages: ['uz', 'ru', 'en'],
  practiceLanguage: 'mixed',
  contentLanguage: 'en',
  audience: {
    description: {
      en: 'Students, job seekers, teachers, managers, founders and anyone who has to speak in front of people in Uzbekistan — from a first nervous talk (L1) to a confident speaker (L5). Suitable from age 13.',
      uz: 'Talabalar, ish izlovchilar, o‘qituvchilar, rahbarlar, startap asoschilari va O‘zbekistonda odamlar oldida gapirishi kerak bo‘lgan har kim — birinchi hayajonli chiqishdan (L1) ishonchli notiqqacha (L5). 13 yoshdan.',
      ru: 'Студенты, соискатели, учителя, руководители, основатели стартапов и все, кому нужно выступать перед людьми в Узбекистане, — от первого робкого выступления (L1) до уверенного спикера (L5). С 13 лет.',
    },
    minAge: 13,
    levels: [1, 5],
  },
  scale: SPEAKER_SCALE,
  skills: [
    { id: 'structure', name: { en: 'Structure', uz: 'Tuzilma', ru: 'Структура' }, weight: 1.3 },
    { id: 'structure.hook', parent: 'structure', name: { en: 'Hook', uz: 'Diqqatni tortuvchi kirish', ru: 'Зацепка' } },
    { id: 'structure.points', parent: 'structure', name: { en: 'Main points and signposts', uz: 'Asosiy fikrlar va o‘tishlar', ru: 'Тезисы и связки' } },
    { id: 'structure.close', parent: 'structure', name: { en: 'Close and call to action', uz: 'Yakun va chaqiriq', ru: 'Финал и призыв' } },
    { id: 'delivery', name: { en: 'Delivery', uz: 'Nutq ijrosi', ru: 'Подача' }, weight: 1.2 },
    { id: 'delivery.pace', parent: 'delivery', name: { en: 'Pace, pauses and fillers', uz: 'Sur’at, pauza va to‘ldiruvchilar', ru: 'Темп, паузы и слова-паразиты' } },
    { id: 'delivery.pauses', parent: 'delivery', name: { en: 'Pauses', uz: 'Pauzalar', ru: 'Паузы' } },
    { id: 'delivery.fillers', parent: 'delivery', name: { en: 'Filler words', uz: 'To‘ldiruvchi so‘zlar', ru: 'Слова-паразиты' } },
    { id: 'delivery.clarity', parent: 'delivery', name: { en: 'Clarity', uz: 'Aniqlik', ru: 'Ясность' } },
    { id: 'delivery.language', parent: 'delivery', name: { en: 'Language and register', uz: 'Til va uslub', ru: 'Язык и стиль' } },
    { id: 'delivery.voice', parent: 'delivery', name: { en: 'Voice and intonation', uz: 'Ovoz va ohang', ru: 'Голос и интонация' } },
    { id: 'content', name: { en: 'Content', uz: 'Mazmun', ru: 'Содержание' } },
    { id: 'content.storytelling', parent: 'content', name: { en: 'Storytelling', uz: 'Hikoya qilish', ru: 'Сторителлинг' } },
    { id: 'content.persuasion', parent: 'content', name: { en: 'Persuasion', uz: 'Ishontirish', ru: 'Убеждение' } },
    { id: 'content.examples', parent: 'content', name: { en: 'Examples and evidence', uz: 'Misollar va dalillar', ru: 'Примеры и факты' } },
    { id: 'interaction', name: { en: 'Audience and Q&A', uz: 'Auditoriya va savol-javob', ru: 'Аудитория и вопросы' } },
    { id: 'interaction.qa', parent: 'interaction', name: { en: 'Answering questions', uz: 'Savollarga javob', ru: 'Ответы на вопросы' } },
    { id: 'interaction.audience', parent: 'interaction', name: { en: 'Reading the room', uz: 'Auditoriyani his qilish', ru: 'Чувство аудитории' } },
    { id: 'formats', name: { en: 'Formats', uz: 'Nutq turlari', ru: 'Форматы' }, weight: 0.8 },
    { id: 'formats.elevator_pitch', parent: 'formats', name: { en: 'Elevator pitch', uz: 'Elevator pitch', ru: 'Elevator pitch' } },
    { id: 'formats.impromptu', parent: 'formats', name: { en: 'Impromptu speaking', uz: 'Tayyorgarliksiz nutq', ru: 'Импровизация' } },
    { id: 'formats.storytelling_talk', parent: 'formats', name: { en: 'Story talk', uz: 'Hikoya nutqi', ru: 'Выступление-история' } },
    { id: 'formats.presentation', parent: 'formats', name: { en: 'Presentation', uz: 'Taqdimot', ru: 'Презентация' } },
  ],
  errorTags: [
    tag('filler_heavy', 'delivery.fillers', 'drill.fillers', ['Filler words', 'To‘ldiruvchi so‘zlar', 'Слова-паразиты'], [
      'Fillers ("ee", "um", "типа", "anu") fill silence while you think. Listeners hear them as nerves. Replace each one with a short silent pause: close your mouth, breathe, then say the next word.',
      'To‘ldiruvchilar («ee», «anu», «haligi», «um») o‘ylayotganda jimlikni to‘ldiradi. Tinglovchi ularni hayajon deb qabul qiladi. Har birini qisqa jim pauza bilan almashtiring: og‘zingizni yuming, nafas oling, keyin keyingi so‘zni ayting.',
      'Слова-паразиты («ну», «типа», «короче», «um») заполняют тишину, пока вы думаете. Слушатели слышат в них волнение. Заменяйте каждое короткой молчаливой паузой: закройте рот, вдохните и скажите следующее слово.',
    ]),
    tag('too_fast', 'delivery.pace', 'drill.pace', ['Speaking too fast', 'Juda tez gapirish', 'Слишком быстрый темп'], [
      'Above about 170 words a minute, many listeners start to fall behind. Slow down on numbers, names and your key sentence, and end each point with a pause.',
      'Daqiqasiga taxminan 170 so‘zdan tez gapirilsa, ko‘p tinglovchilar ulgurmay qoladi. Raqamlar, ismlar va asosiy gapingizda sekinlashing, har bir fikrdan keyin pauza qiling.',
      'Если говорить быстрее примерно 170 слов в минуту, многие слушатели начинают не успевать. Замедляйтесь на цифрах, именах и главной фразе, после каждого тезиса делайте паузу.',
    ]),
    tag('no_pauses', 'delivery.pauses', 'drill.pauses', ['No pauses', 'Pauzasiz nutq', 'Речь без пауз'], [
      'Pauses are punctuation for the ear. Pause before your key idea, after a question to the audience and between points, for one to two seconds. A pause sounds confident; a filler does not.',
      'Pauza — quloq uchun tinish belgisi. Asosiy fikrdan oldin, auditoriyaga savol bergandan keyin va fikrlar orasida bir-ikki soniya to‘xtang. Pauza ishonchli eshitiladi, to‘ldiruvchi so‘z esa — aksincha.',
      'Паузы — это знаки препинания для слуха. Делайте паузу в одну-две секунды перед главной мыслью, после вопроса залу и между тезисами. Пауза звучит уверенно, слово-паразит — нет.',
    ]),
    tag('no_hook', 'structure.hook', 'drill.hook', ['A flat opening', 'Zerikarli boshlanish', 'Слабое начало'], [
      'The first two sentences decide whether people listen. Open with a question, a surprising fact you know is true, a short story or a picture in words — not with "Today I will talk about…".',
      'Dastlabki ikki gap odamlar tinglaydimi-yo‘qmi, shuni hal qiladi. Savol, aniq bilgan qiziq fakt, qisqa hikoya yoki so‘z bilan chizilgan manzara bilan boshlang — «Bugun men … haqida gapiraman» bilan emas.',
      'Первые две фразы решают, будут ли вас слушать. Начните с вопроса, удивительного факта, в котором вы уверены, короткой истории или яркой картинки — а не с «Сегодня я расскажу о…».',
    ]),
    tag('no_close', 'structure.close', 'drill.close', ['No clear close', 'Aniq yakun yo‘q', 'Нет ясного финала'], [
      'End on purpose: one sentence that sums up your message and one clear request (what should people think, feel or do?). Never finish with "That’s all" or "Sorry, I think that’s it".',
      'Nutqni ataylab yakunlang: xabaringizni jamlovchi bitta gap va bitta aniq iltimos (odamlar nima o‘ylashi, his qilishi yoki qilishi kerak?). Hech qachon «Bo‘ldi, shu» yoki «Kechirasiz, shekilli, hammasi shu» bilan tugatmang.',
      'Заканчивайте намеренно: одна фраза с итогом и одна ясная просьба (что людям думать, чувствовать или сделать?). Никогда не заканчивайте словами «Ну, всё» или «Извините, кажется, это всё».',
    ]),
    tag('rambling', 'structure.points', 'drill.signposts', ['Rambling without signposts', 'Rejasiz, chalkash nutq', 'Сбивчивая речь без связок'], [
      'Give the listener a map: say how many points you have, number them as you go ("First…", "The second reason…") and close each one before you start the next. Two or three points are enough.',
      'Tinglovchiga xarita bering: nechta fikringiz borligini ayting, ularni sanab boring («Birinchidan…», «Ikkinchi sabab…») va keyingisini boshlashdan oldin har birini yakunlang. Ikki-uchta fikr yetarli.',
      'Дайте слушателю карту: скажите, сколько у вас тезисов, нумеруйте их («Во-первых…», «Вторая причина…») и завершайте каждый, прежде чем начать следующий. Двух-трёх тезисов достаточно.',
    ]),
    tag('monotone', 'delivery.voice', 'drill.voice', ['Reading out, flat voice', 'Qog‘ozdan o‘qish, bir xil ohang', 'Чтение с листа, монотонный голос'], [
      'A flat, read-out voice can only be judged from the sound, so the coach never scores it from a transcript. Practise with shadowing: stress one key word per sentence, let your voice rise on a yes/no question, slow down for the important line.',
      'Bir xil, qog‘ozdan o‘qilgan ohangni faqat ovozdan baholash mumkin, shuning uchun murabbiy uni matndan baholamaydi. Shadowing (takrorlash mashqi) bilan ishlang: har gapda bitta kalit so‘zga urg‘u bering, «ha/yo‘q» savolida ohangni ko‘taring, muhim gapda sekinlashing.',
      'Ровный голос «как по бумажке» можно оценить только на слух, поэтому коуч не оценивает его по тексту. Тренируйтесь в шэдоуинге: выделяйте одно ключевое слово во фразе, повышайте тон в вопросе, на который отвечают «да» или «нет», замедляйтесь на главной фразе.',
    ]),
    tag('jargon', 'delivery.clarity', 'drill.plain', ['Jargon and long sentences', 'Atamalar va uzun gaplar', 'Жаргон и длинные фразы'], [
      'If your listener needs a dictionary, you have lost them. Use the everyday word, explain any term in one short sentence, and keep spoken sentences under about twenty words.',
      'Agar tinglovchiga lug‘at kerak bo‘lsa, siz uning e’tiborini yo‘qotgansiz. Oddiy so‘zni ishlating, har qanday atamani bitta qisqa gap bilan tushuntiring va og‘zaki gaplarni taxminan yigirma so‘zdan qisqa tuting.',
      'Если слушателю нужен словарь, вы его потеряли. Используйте обычное слово, объясняйте термин одной короткой фразой и говорите фразами не длиннее примерно двадцати слов.',
    ]),
    tag('apologising', 'structure.hook', 'drill.apology', ['Apologising openings', 'Uzr so‘rab boshlash', 'Извинения в начале'], [
      '"Sorry, I am not a good speaker" tells people not to listen. Do not apologise for yourself, your English or your slides. Start with your first strong sentence; nerves are invisible to most of the room.',
      '«Kechirasiz, men yaxshi notiq emasman» degan gap odamlarga «meni tinglamang» deganday eshitiladi. O‘zingiz, tilingiz yoki slaydlaringiz uchun uzr so‘ramang. Birinchi kuchli gapingiz bilan boshlang; hayajoningizni xonadagilarning ko‘pi sezmaydi.',
      '«Извините, я плохой оратор» — это сигнал «не слушайте». Не извиняйтесь за себя, язык или слайды. Начните с первой сильной фразы: ваше волнение почти никто в зале не видит.',
    ]),
    tag('weak_answer', 'interaction.qa', 'drill.qa', ['Weak answers to hard questions', 'Qiyin savollarga zaif javob', 'Слабые ответы на трудные вопросы'], [
      'Answer the question that was asked, first, in one sentence; then give one reason or example; then stop. With a hostile question, stay calm, thank them, say what you agree with, then answer the core. If you do not know, say so and promise to follow up.',
      'Berilgan savolga avval bitta gap bilan javob bering; keyin bitta sabab yoki misol keltiring; keyin to‘xtang. Dushmanona savolda xotirjam bo‘ling, minnatdorchilik bildiring, nimaga qo‘shilishingizni ayting, keyin asosiy qismga javob bering. Bilmasangiz, shuni ayting va keyin javob berishni va’da qiling.',
      'Сначала ответьте на заданный вопрос одной фразой, затем одна причина или пример — и остановитесь. На враждебный вопрос отвечайте спокойно: поблагодарите, скажите, с чем согласны, и ответьте по сути. Не знаете — так и скажите и пообещайте вернуться с ответом.',
    ]),
    tag('no_example', 'content.examples', 'drill.examples', ['No example or story', 'Misol yoki hikoya yo‘q', 'Нет примера или истории'], [
      'People remember stories and examples, not general claims. Back each main point with one concrete example: a person, a place, a number you know is true, or a short moment from your own life.',
      'Odamlar umumiy gaplarni emas, hikoya va misollarni eslab qoladi. Har bir asosiy fikrni bitta aniq misol bilan quvvatlang: odam, joy, aniq bilgan raqam yoki hayotingizdan qisqa lahza.',
      'Люди запоминают истории и примеры, а не общие слова. Подкрепляйте каждый тезис одним конкретным примером: человек, место, цифра, в которой вы уверены, или короткий эпизод из вашей жизни.',
    ]),
  ],
  menu: [
    { action: 'today', emoji: '📅', label: { en: 'Today', uz: 'Bugun', ru: 'Сегодня' } },
    { action: 'speaking', emoji: '🎤', label: { en: 'Speak', uz: 'Nutq mashqi', ru: 'Выступить' } },
    { action: 'mock', emoji: '🏆', label: { en: 'Showcase', uz: 'Ko‘rik nutqi', ru: 'Полное выступление' } },
    { action: 'roleplay', emoji: '🙋', label: { en: 'Q&A practice', uz: 'Savol-javob', ru: 'Вопросы зала' } },
    { action: 'shadowing', emoji: '🔁', label: { en: 'Pace and pauses', uz: 'Sur’at va pauza', ru: 'Темп и паузы' } },
    { action: 'drill', emoji: '⚡', label: { en: 'Quick drills', uz: 'Tezkor mashqlar', ru: 'Быстрые упражнения' } },
    { action: 'lesson', emoji: '📘', label: { en: 'Micro-lesson', uz: 'Mini-dars', ru: 'Мини-урок' } },
    { action: 'progress', emoji: '📈', label: { en: 'Progress', uz: 'Natijalar', ru: 'Прогресс' } },
    { action: 'report', emoji: '🗓', label: { en: 'Weekly report', uz: 'Haftalik hisobot', ru: 'Отчёт за неделю' } },
    { action: 'plan', emoji: '🎯', label: { en: 'My plan', uz: 'Rejam', ru: 'Мой план' } },
    { action: 'settings', emoji: '⚙️', label: { en: 'Settings', uz: 'Sozlamalar', ru: 'Настройки' } },
    { action: 'help', emoji: '❓', label: { en: 'Help', uz: 'Yordam', ru: 'Помощь' } },
  ],
  commands: [
    { command: 'today', description: { en: 'Today’s practice plan', uz: 'Bugungi mashq rejasi', ru: 'План практики на сегодня' } },
    { command: 'speaking', description: { en: 'Pitch, impromptu, story or rehearsal', uz: 'Pitch, tayyorgarliksiz nutq, hikoya yoki repetitsiya', ru: 'Питч, импровизация, история или репетиция' } },
    { command: 'mock', description: { en: 'The full showcase talk with a review', uz: 'Tahlilli to‘liq ko‘rik nutqi', ru: 'Полное выступление с разбором' } },
    { command: 'roleplay', description: { en: 'Answer the audience’s questions', uz: 'Auditoriya savollariga javob', ru: 'Ответы на вопросы зала' } },
    { command: 'shadowing', description: { en: 'Pace and pause practice', uz: 'Sur’at va pauza mashqi', ru: 'Тренировка темпа и пауз' } },
    { command: 'drill', description: { en: 'Two-minute drills on your errors', uz: 'Xatolaringiz bo‘yicha ikki daqiqalik mashq', ru: 'Двухминутные упражнения по ошибкам' } },
    { command: 'lesson', description: { en: 'A two-minute speaking lesson', uz: 'Ikki daqiqalik notiqlik darsi', ru: 'Двухминутный урок ораторского мастерства' } },
    { command: 'progress', description: { en: 'Your level and progress', uz: 'Darajangiz va natijalar', ru: 'Ваш уровень и прогресс' } },
    { command: 'report', description: { en: 'This week vs last week', uz: 'O‘tgan hafta bilan taqqoslash', ru: 'Сравнение с прошлой неделей' } },
    { command: 'plan', description: { en: 'Your goal and plan', uz: 'Maqsad va reja', ru: 'Цель и план' } },
    { command: 'settings', description: { en: 'Language, reminders, corrections', uz: 'Til, eslatmalar, tuzatishlar', ru: 'Язык, напоминания, исправления' } },
    { command: 'help', description: { en: 'How this coach works', uz: 'Murabbiy qanday ishlaydi', ru: 'Как работает коуч' } },
  ],
  correctionModes: ['gentle', 'strict'],
  accent: '#7c3aed',
};

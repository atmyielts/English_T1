import type { IntensiveSkill } from '../../../../supabase/functions/_shared/english-intensive';

type Translation = readonly [string, string, string];

const labels: Record<string, Translation> = {
  title: ['Intensive practice', 'Интенсивная практика', 'Jadal mashgʻulot'],
  lead: ['Work through a theme from seven angles. Start with any skill and return to your saved work.', 'Изучайте одну тему с разных сторон. Начните с любого навыка и возвращайтесь к сохранённым работам.', 'Bir mavzuni yetti tomondan oʻrganing. Istalgan koʻnikmadan boshlang va saqlangan ishingizga qayting.'],
  skillLead: ['Longer {skill} sessions with source material and work you can save.', 'Длительные занятия по навыку «{skill}» с материалами и сохранением работы.', '{skill} boʻyicha manbalar va ishni saqlash imkoniyati bilan uzunroq mashgʻulotlar.'],
  teaser: ['Use English to solve a real problem, compare sources or revise a response.', 'Решайте практические задачи, сравнивайте источники и дорабатывайте свои ответы на английском.', 'Ingliz tilida amaliy masalani hal qiling, manbalarni solishtiring yoki javobingizni qayta ishlang.'],
  open: ['Explore sessions', 'Выбрать занятие', 'Mashgʻulotlarni koʻrish'],
  allSkills: ['See all seven skills', 'Все семь навыков', 'Yetti koʻnikmaning barchasi'],
  libraryCount: ['{count} themes · about {hours} hours', 'Тем: {count} · около {hours} ч', '{count} ta mavzu · taxminan {hours} soat'],
  unitProgress: ['{done} of {total} completed', 'Завершено {done} из {total}', '{total} tadan {done} tasi bajarildi'],
  paused: ['Temporarily paused', 'Временно приостановлено', 'Vaqtincha toʻxtatilgan'],
  suggested: ['About {count} min', 'Около {count} мин', 'Taxminan {count} daqiqa'],
  agenda: ['Study plan', 'План занятия', 'Mashgʻulot rejasi'],
  focusTask: ['For this session', 'На этом занятии', 'Bu mashgʻulot uchun'],
  ownPace: ['Use the time as a guide. You can save work and return whenever you like.', 'Время указано для ориентира. Сохраните работу и вернитесь к ней в удобный момент.', 'Vaqt taxminiy. Ishingizni saqlang va xohlagan paytingizda qayting.'],
  documents: ['Source documents', 'Исходные тексты', 'Manba matnlar'],
  recordings: ['Listening sources', 'Материалы для аудирования', 'Tinglash manbalari'],
  transcript: ['Read the transcript', 'Читать расшифровку', 'Tinglash matnini oʻqish'],
  audioSoon: ['Audio coming soon', 'Аудио скоро появится', 'Audio tez orada'],
  audioSoonBody: ['Listening sessions will open when their recordings are ready.', 'Занятия по аудированию откроются, когда будут готовы записи.', 'Tinglash mashgʻulotlari audio yozuvlar tayyor boʻlganda ochiladi.'],
  transfer: ['Apply the pattern', 'Примените правило', 'Qoidani qoʻllang'],
  words: ['Vocabulary recall', 'Вспомните лексику', 'Soʻzlarni esga tushiring'],
  recallHint: ['Try to recall the meaning and a word that often goes with it. Open the entry to compare with the example.', 'Вспомните значение слова и с чем оно обычно сочетается. Откройте карточку и сравните с примером.', 'Soʻzning ma’nosi va u bilan tez-tez ishlatiladigan soʻzni eslang. Misol bilan solishtirish uchun kartani oching.'],
  firstTake: ['First take', 'Первая запись', 'Birinchi urinish'],
  firstDraft: ['First draft', 'Первый черновик', 'Birinchi qoralama'],
  audience: ['Audience', 'Аудитория', 'Tinglovchi yoki oʻquvchi'],
  newSituation: ['Open the change in situation', 'Узнать, что изменилось', 'Vaziyatdagi oʻzgarishni ochish'],
  checklist: ['Self-check', 'Самопроверка', 'Oʻzini tekshirish'],
  micHelp: ['Record up to one minute at a time and play it back. The recording stays in this tab.', 'Записывайте фрагменты до минуты и прослушивайте их. Запись остаётся в этой вкладке.', 'Bir martada bir daqiqagacha yozib, qayta tinglang. Yozuv shu sahifada qoladi.'],
  micFallback: ['Practise aloud and write down what you would change after each take.', 'Говорите вслух и после каждой попытки записывайте, что хотите исправить.', 'Ovoz chiqarib mashq qiling va har urinishdan soʻng nimani oʻzgartirishingizni yozing.'],
  record: ['Record a take', 'Начать запись', 'Yozishni boshlash'],
  stopRecording: ['Stop recording', 'Остановить запись', 'Yozishni toʻxtatish'],
  yourTake: ['Your recording', 'Ваша запись', 'Yozuvingiz'],
  mission: ['Your assignment', 'Ваше задание', 'Vazifangiz'],
  deliverables: ['What to produce', 'Что нужно подготовить', 'Tayyorlanadigan ishlar'],
  questions: ['Check your understanding', 'Проверьте понимание', 'Tushunganingizni tekshiring'],
  check: ['Check answers', 'Проверить ответы', 'Javoblarni tekshirish'],
  result: ['{count} of {total} correct', 'Верно {count} из {total}', '{total} tadan {count} tasi toʻgʻri'],
  correct: ['Correct', 'Верно', 'Toʻgʻri'],
  review: ['Review this answer', 'Разберите этот ответ', 'Bu javobni koʻrib chiqing'],
  yourWork: ['Your work', 'Ваша работа', 'Ishingiz'],
  saveHelp: ['Save notes and drafts to resume on another device. You can finish when each section has your response.', 'Сохраните черновики, чтобы продолжить на другом устройстве. Для завершения заполните все разделы.', 'Boshqa qurilmada davom etish uchun qayd va qoralamalaringizni saqlang. Yakunlash uchun barcha boʻlimlarni toʻldiring.'],
  save: ['Save draft', 'Сохранить черновик', 'Qoralamani saqlash'],
  saved: ['Saved', 'Сохранено', 'Saqlandi'],
  unsaved: ['Unsaved work', 'Работа не сохранена', 'Saqlanmagan ish'],
  finish: ['Complete session', 'Завершить занятие', 'Mashgʻulotni yakunlash'],
  finishRevision: ['Save completed revision', 'Сохранить доработку', 'Tahrirlangan ishni saqlash'],
  complete: ['Completed', 'Завершено', 'Bajarildi'],
  conflict: ['A newer draft exists on another tab or device. Copy any changes you want to keep before loading it.', 'В другой вкладке или на другом устройстве есть новая версия. Скопируйте нужные изменения перед загрузкой.', 'Boshqa sahifa yoki qurilmada yangiroq qoralama bor. Uni yuklashdan oldin kerakli oʻzgarishlarni nusxalab oling.'],
  loadSaved: ['Load latest saved draft', 'Загрузить последний черновик', 'Oxirgi saqlangan qoralamani yuklash'],
};

const stages: Record<IntensiveSkill, readonly [Translation, Translation, Translation, Translation]> = {
  reading: [
    ['Skim both texts and give each a one-line purpose. Then read them closely.', 'Просмотрите оба текста, сформулируйте цель каждого и затем перечитайте внимательно.', 'Ikki matnni koʻzdan kechiring, har birining maqsadini bir satrda yozing va diqqat bilan qayta oʻqing.'],
    ['Record three useful details from each source. Mark what the sources agree on and where they differ.', 'Выпишите по три детали из каждого источника. Отметьте сходства и различия.', 'Har bir manbadan uchtadan muhim tafsilotni yozing. Mos va farqli jihatlarni belgilang.'],
    ['Answer the questions. Explain two corrections or why two tempting options do not fit.', 'Ответьте на вопросы. Объясните две ошибки или почему два правдоподобных варианта не подходят.', 'Savollarga javob bering. Ikkita xatoni yoki ishontiruvchi ikkita variant nega mos emasligini izohlang.'],
    ['Write a short synthesis for someone who has seen neither source. Support it with a detail from each.', 'Напишите краткий вывод для человека, который не читал источники. Используйте деталь из каждого.', 'Manbalarni oʻqimagan odamga qisqa xulosa yozing. Har biridan bitta dalil ishlating.'],
  ],
  listening: [
    ['Listen to both clips without the transcripts and note each speaker’s main point.', 'Прослушайте обе записи без текста и запишите их главные мысли.', 'Ikkala yozuvni matnsiz tinglang va har birining asosiy fikrini yozing.'],
    ['Listen again. Record three important details per clip and answer the questions.', 'Прослушайте ещё раз. Запишите по три важных детали и ответьте на вопросы.', 'Yana tinglang. Har bir yozuvdan uchta muhim tafsilotni yozing va savollarga javob bering.'],
    ['Compare your notes with the transcripts. Transcribe two short sections before looking again and correct them.', 'Сверьте заметки с расшифровками. Запишите на слух два коротких фрагмента и исправьте ошибки.', 'Qaydlaringizni matn bilan solishtiring. Matnga qaramay ikkita qisqa parchani yozing va tuzating.'],
    ['Give a short oral recap. Write the key differences and the detail most likely to be missed.', 'Кратко перескажите услышанное вслух. Запишите ключевые различия и деталь, которую легко пропустить.', 'Tinglaganingizni qisqa ogʻzaki ayting. Asosiy farqlarni va oson oʻtkazib yuboriladigan tafsilotni yozing.'],
  ],
  grammar: [
    ['Read the rule and worked examples. Explain in your own words what each edit changes.', 'Разберите правило и примеры. Своими словами объясните, что меняет каждая правка.', 'Qoida va ishlangan misollarni oʻqing. Har bir tuzatish nimani oʻzgartirishini oʻz soʻzingiz bilan tushuntiring.'],
    ['Do the exercises. For three items, write which feature made the correct answer work.', 'Выполните упражнения. В трёх примерах объясните, что делает ответ правильным.', 'Mashqlarni bajaring. Uchta misolda toʻgʻri javobning xususiyatini yozing.'],
    ['Do the transfer task. Add two original examples and one pair where the grammar changes the meaning.', 'Выполните практическое задание. Добавьте два своих примера и одну пару, в которой грамматика меняет смысл.', 'Qoʻllash topshirigʻini bajaring. Ikkita yangi misol va grammatika ma’noni oʻzgartiradigan bitta juftlik yozing.'],
    ['Edit your work and read it aloud. Record which edits improve meaning or accuracy.', 'Отредактируйте работу и прочитайте её вслух. Запишите, какие правки улучшили точность или смысл.', 'Ishingizni tahrir qilib, ovoz chiqarib oʻqing. Qaysi tuzatish ma’no yoki aniqlikni yaxshilaganini yozing.'],
  ],
  vocabulary: [
    ['Recall the meanings and common word partners before opening the entries. Note what you missed.', 'Вспомните значения и сочетания перед открытием карточек. Отметьте, что забыли.', 'Kartalarni ochishdan avval soʻzlarning ma’nosi va birikmalarini eslang. Eslay olmaganlaringizni yozing.'],
    ['Turn six examples into new sentences. Change the situation while keeping each phrase natural.', 'Составьте шесть новых предложений по примерам. Смените ситуацию, сохранив естественное сочетание.', 'Oltita misol asosida yangi gap yozing. Vaziyatni oʻzgartiring va birikmani tabiiy ishlating.'],
    ['Read the sources and find suitable places for four target expressions. Explain the best choices.', 'Прочитайте источники и подберите места для четырёх выражений. Объясните свои решения.', 'Manbalarda toʻrtta maqsadli iborani qoʻllash mumkin boʻlgan joylarni toping. Tanlovingizni izohlang.'],
    ['Write a short message or dialogue using six terms. Close the cards and recall the missed words once more.', 'Напишите сообщение или диалог с шестью словами. Закройте карточки и снова вспомните пропущенные слова.', 'Oltita soʻz bilan qisqa xabar yoki suhbat yozing. Kartalarni yoping va unutgan soʻzlarni yana eslang.'],
  ],
  speaking: [
    ['Identify your audience and plan the order of your points using the source material.', 'Определите аудиторию и спланируйте порядок мыслей по источникам.', 'Tinglovchingizni aniqlang va manbalardan foydalanib fikrlar tartibini rejalashtiring.'],
    ['Deliver the first take aloud. Replay it or repeat it from memory and note two things to improve.', 'Произнесите первый ответ. Прослушайте или повторите его по памяти и отметьте два улучшения.', 'Birinchi javobni ovoz chiqarib ayting. Qayta tinglang yoki yoddan takrorlang va ikkita yaxshilash nuqtasini yozing.'],
    ['Open the new situation and prepare a second take. Change the message where the audience or facts require it.', 'Откройте новую ситуацию и подготовьте второй ответ. Измените его под аудиторию или новые факты.', 'Yangi vaziyatni oching va ikkinchi urinishga tayyorlaning. Tinglovchi yoki faktlar talab qilgan joylarni oʻzgartiring.'],
    ['Deliver the revised take. Use the checklist to compare the two and record your strongest revision.', 'Произнесите доработанный ответ. Сравните обе попытки по списку и запишите главное улучшение.', 'Tahrirlangan javobni ayting. Ikki urinishni roʻyxat boʻyicha taqqoslang va eng yaxshi tuzatishni yozing.'],
  ],
  writing: [
    ['Read the brief and sources. Outline what your reader needs and which details support it.', 'Прочитайте задание и источники. Отметьте, что нужно читателю и какие детали это подтверждают.', 'Topshiriq va manbalarni oʻqing. Oʻquvchiga nima kerakligi va qaysi tafsilotlar yordam berishini rejalashtiring.'],
    ['Write the first version. Check that the purpose and request are clear before opening the update.', 'Напишите первую версию. Проверьте, ясны ли цель и просьба, прежде чем читать обновление.', 'Birinchi variantni yozing. Oʻzgarishni ochishdan avval maqsad va iltimos aniq ekanini tekshiring.'],
    ['Read the change and write the second version. Reconsider the content and tone for the new situation.', 'Прочитайте обновление и напишите вторую версию. Пересмотрите содержание и тон для новой ситуации.', 'Oʻzgarishni oʻqing va ikkinchi variantni yozing. Yangi vaziyatga mos mazmun va ohangni tanlang.'],
    ['Use the checklist to edit both pieces. Identify a sentence you changed and why the new version works.', 'Отредактируйте обе версии по списку. Укажите, какое предложение вы изменили и почему.', 'Ikkala variantni tekshiruv roʻyxati bilan tahrir qiling. Oʻzgartirgan gapingizni va sababini yozing.'],
  ],
  immersion: [
    ['Read the assignment and evidence. List what matters to each person involved.', 'Изучите задание и источники. Запишите, что важно каждому участнику.', 'Vazifa va dalillarni oʻqing. Har bir ishtirokchi uchun nima muhimligini yozing.'],
    ['Compare two possible plans. Make the first requested item and explain one trade-off.', 'Сравните два плана. Подготовьте первый требуемый материал и объясните один компромисс.', 'Ikki rejani taqqoslang. Birinchi talab qilingan ishni tayyorlang va bitta murosani tushuntiring.'],
    ['Open the update, revise your decision and produce the rest of the items in the brief.', 'Откройте обновление, пересмотрите решение и подготовьте остальные материалы.', 'Oʻzgarishni oching, qaroringizni qayta koʻrib chiqing va qolgan ishlarni tayyorlang.'],
    ['Write the handover for the next person. Use the checklist to spot any unresolved questions.', 'Подготовьте передачу дела следующему участнику. Проверьте, какие вопросы остались открытыми.', 'Keyingi ishtirokchi uchun topshirish xabarini yozing. Ochiq qolgan savollarni roʻyxat bilan tekshiring.'],
  ],
};

const fields: Record<IntensiveSkill, readonly [Translation, Translation, Translation]> = {
  reading: [['Evidence notes', 'Заметки по источникам', 'Dalil qaydlari'], ['Corrections and explanations', 'Исправления и объяснения', 'Tuzatish va izohlar'], ['Synthesis', 'Итоговый вывод', 'Umumiy xulosa']],
  listening: [['Listening notes', 'Заметки по записям', 'Tinglash qaydlari'], ['Dictation and corrections', 'Диктант и исправления', 'Diktant va tuzatishlar'], ['Recap notes', 'План пересказа', 'Qayta hikoya qaydlari']],
  grammar: [['Reasons for your answers', 'Объяснения ответов', 'Javoblaringiz sababi'], ['Transfer examples', 'Свои примеры', 'Qoʻllash misollari'], ['Edited version', 'Исправленная версия', 'Tahrirlangan variant']],
  vocabulary: [['Recall notes', 'Что удалось вспомнить', 'Eslash qaydlari'], ['Your examples', 'Ваши примеры', 'Misollaringiz'], ['Message or dialogue', 'Сообщение или диалог', 'Xabar yoki suhbat']],
  speaking: [['Speaking plan', 'План выступления', 'Soʻzlash rejasi'], ['First-take reflection', 'Разбор первой попытки', 'Birinchi urinish tahlili'], ['Revised plan and self-check', 'Новый план и самопроверка', 'Yangi reja va oʻzini tekshirish']],
  writing: [['Outline', 'План текста', 'Matn rejasi'], ['First draft', 'Первый черновик', 'Birinchi qoralama'], ['Revised draft and edit notes', 'Второй черновик и правки', 'Tahrirlangan qoralama va qaydlar']],
  immersion: [['Options and trade-offs', 'Варианты и компромиссы', 'Variantlar va murosalar'], ['Work products', 'Подготовленные материалы', 'Tayyorlangan ishlar'], ['Handover and self-check', 'Передача дела и проверка', 'Topshirish va oʻzini tekshirish']],
};

const entries = [
  ...Object.entries(labels),
  ...Object.entries(stages).flatMap(([skill, rows]) => rows.map((row, i) => [`stage.${skill}.${i}`, row] as const)),
  ...Object.entries(fields).flatMap(([skill, rows]) => rows.map((row, i) => [`field.${skill}.${i}`, row] as const)),
];
const dictionary = (index: 0 | 1 | 2) => Object.fromEntries(entries.map(([key, row]) => [`intensive.${key}`, row[index]]));
export const intensiveCatalogs = { en: dictionary(0), ru: dictionary(1), uz: dictionary(2) };

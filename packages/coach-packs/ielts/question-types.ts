import type { PackSource } from '../src/types.ts';

// IELTS Reading and Listening question types with the strategy the coach teaches
// for each. Ids follow the long names in packages/ielts-core question-types.ts
// without the `question_` prefix. `node` is the skill node a result moves.

export const questionTypes: PackSource['questionTypes'] = [
  // --- Reading -----------------------------------------------------------------------------------
  {
    id: 'true_false_not_given',
    node: 'reading.tfng',
    name: { en: 'True / False / Not Given', uz: 'True / False / Not Given', ru: 'True / False / Not Given' },
    strategy: {
      en: 'Find the sentence in the passage that the statement is about, then compare them word by word. False means the passage says the opposite; Not Given means the passage says nothing about that exact point, even if the topic is mentioned. Watch the small words that change meaning: all/some, always/often, the first/one of the first. Never answer from your own knowledge.',
      uz: 'Avval matndan bayonot tegishli bo‘lgan gapni toping va ularni so‘zma-so‘z solishtiring. False — matn buning teskarisini aytadi; Not Given — mavzu tilga olingan bo‘lsa ham, aynan shu nuqta haqida matnda hech narsa yo‘q. Ma’noni o‘zgartiruvchi kichik so‘zlarga e’tibor bering: all/some, always/often, the first/one of the first. Hech qachon o‘z bilimingizga tayanib javob bermang.',
      ru: 'Найдите в тексте предложение, к которому относится утверждение, и сравните их слово за словом. False — текст говорит обратное; Not Given — об этом конкретном пункте в тексте ничего нет, даже если сама тема упоминается. Следите за мелкими словами, меняющими смысл: all/some, always/often, the first/one of the first. Никогда не отвечайте по собственным знаниям.',
    },
  },
  {
    id: 'yes_no_not_given',
    node: 'reading.tfng',
    name: { en: 'Yes / No / Not Given', uz: 'Yes / No / Not Given', ru: 'Yes / No / Not Given' },
    strategy: {
      en: 'These statements test the writer’s opinions and claims, not plain facts, so look for evaluative words: argues, doubts, rightly, it is a mistake to. Yes means the writer agrees, No means the writer clearly rejects the view, and Not Given means the writer reports the idea without judging it or never discusses it. A view the writer only quotes from someone else is not automatically the writer’s own.',
      uz: 'Bu bayonotlar oddiy faktlarni emas, muallifning fikri va da’volarini tekshiradi, shuning uchun baho beruvchi so‘zlarni qidiring: argues, doubts, rightly, it is a mistake to. Yes — muallif rozi, No — muallif bu fikrni aniq rad etadi, Not Given — muallif g‘oyani baholamay keltiradi yoki umuman muhokama qilmaydi. Muallif boshqa birovdan iqtibos keltirgan fikr avtomatik ravishda uning o‘z fikri emas.',
      ru: 'Здесь проверяются мнения и утверждения автора, а не просто факты, поэтому ищите оценочные слова: argues, doubts, rightly, it is a mistake to. Yes — автор согласен, No — автор явно отвергает эту точку зрения, Not Given — автор пересказывает идею без оценки или вообще её не обсуждает. Мнение, которое автор лишь цитирует, ещё не его собственное.',
    },
  },
  {
    id: 'matching_headings',
    node: 'reading.matching',
    name: { en: 'Matching headings', uz: 'Sarlavhalarni moslash', ru: 'Подбор заголовков' },
    strategy: {
      en: 'A heading sums up the main idea of the whole paragraph, not one detail in it. Read the first and last sentences, ask yourself what the paragraph is mainly doing (describing a problem, comparing, explaining a cause), then choose. The trap is a heading that repeats a striking word from the paragraph but covers only one example; there are always extra headings you will not use.',
      uz: 'Sarlavha paragrafdagi bitta tafsilotni emas, butun paragrafning asosiy g‘oyasini ifodalaydi. Birinchi va oxirgi gaplarni o‘qing, paragraf asosan nima qilayotganini (muammoni tasvirlash, solishtirish, sababni tushuntirish) o‘zingizdan so‘rang, keyin tanlang. Tuzoq — paragrafdagi ko‘zga tashlanadigan so‘zni takrorlaydigan, ammo faqat bitta misolni qamraydigan sarlavha; ortiqcha sarlavhalar doim bo‘ladi.',
      ru: 'Заголовок передаёт главную мысль всего абзаца, а не одну деталь. Прочитайте первое и последнее предложения, спросите себя, что в основном делает абзац (описывает проблему, сравнивает, объясняет причину), и только потом выбирайте. Ловушка — заголовок, который повторяет яркое слово из абзаца, но охватывает лишь один пример; лишние заголовки есть всегда.',
    },
  },
  {
    id: 'matching_information',
    node: 'reading.matching',
    name: { en: 'Matching information to paragraphs', uz: 'Ma’lumotni paragraflarga moslash', ru: 'Поиск информации в абзацах' },
    strategy: {
      en: 'Here you look for one specific detail (an example, a reason, a comparison, a date), so scan rather than read for gist. Turn each prompt into the kind of thing you need, for example "a reason why the method was abandoned", and expect the passage to use different words for it. Some paragraphs may be used twice and others never, and the answers do not follow the order of the passage.',
      uz: 'Bu yerda aniq bir tafsilotni (misol, sabab, solishtirish, sana) qidirasiz, shuning uchun umumiy ma’no uchun o‘qimang, ko‘z yugurtirib izlang. Har bir topshiriqni qidirilayotgan narsa turiga aylantiring, masalan «usuldan voz kechilish sababi», va matnda u boshqa so‘zlar bilan berilishini kuting. Ba’zi paragraflar ikki marta ishlatilishi, ba’zilari esa umuman ishlatilmasligi mumkin; javoblar matn tartibida kelmaydi.',
      ru: 'Здесь вы ищете конкретную деталь (пример, причину, сравнение, дату), поэтому просматривайте текст, а не читайте для общего смысла. Переформулируйте каждое задание как тип информации, например «причина, по которой от метода отказались», и ждите, что в тексте это сказано другими словами. Одни абзацы могут использоваться дважды, другие ни разу, а ответы идут не по порядку текста.',
    },
  },
  {
    id: 'sentence_completion',
    node: 'reading.completion',
    name: { en: 'Sentence completion', uz: 'Gapni to‘ldirish', ru: 'Завершение предложений' },
    strategy: {
      en: 'Before you look at the passage, predict the type of word the gap needs (a noun, a plural, a number, an adjective) from the grammar around it. Find the matching part of the passage, which usually comes in question order, and copy the words exactly as they are written. Respect the word limit: three words in a NO MORE THAN TWO WORDS gap is marked wrong, and a misspelt word scores nothing.',
      uz: 'Matnga qarashdan oldin atrofdagi grammatikaga qarab bo‘sh joyga qanday so‘z kerakligini (ot, ko‘plik, son, sifat) taxmin qiling. Matnning mos qismini toping, u odatda savollar tartibida keladi, va so‘zlarni aynan yozilganidek ko‘chiring. So‘z chegarasiga rioya qiling: NO MORE THAN TWO WORDS bo‘lgan joyga uchta so‘z yozsangiz xato hisoblanadi, noto‘g‘ri yozilgan so‘z esa ball bermaydi.',
      ru: 'До того как смотреть в текст, по грамматике вокруг пропуска предскажите, какое слово нужно (существительное, множественное число, число, прилагательное). Найдите нужное место текста, оно обычно идёт по порядку вопросов, и перепишите слова точно так, как они написаны. Соблюдайте лимит: три слова при NO MORE THAN TWO WORDS засчитываются как ошибка, а слово с орфографической ошибкой не даёт балла.',
    },
  },
  {
    id: 'summary_completion',
    node: 'reading.completion',
    name: { en: 'Summary completion', uz: 'Xulosani to‘ldirish', ru: 'Заполнение пересказа' },
    strategy: {
      en: 'Read the whole summary first: its title and first sentence tell you which part of the passage it retells, often only two or three paragraphs. Predict the word type for each gap, then match the summary’s paraphrases back to the passage and take the exact words from there. Check that the finished sentence is grammatical, for example a plural after "many", and that you have not gone over the word limit.',
      uz: 'Avval xulosani to‘liq o‘qing: uning sarlavhasi va birinchi gapi matnning qaysi qismini, ko‘pincha faqat ikki-uch paragrafni, qayta hikoya qilayotganini ko‘rsatadi. Har bir bo‘sh joy uchun so‘z turini taxmin qiling, so‘ng xulosadagi parafrazlarni matnga moslab, aniq so‘zlarni o‘sha yerdan oling. Tayyor gap grammatik to‘g‘ri ekanini, masalan «many»dan keyin ko‘plik, va so‘z chegarasidan oshmaganingizni tekshiring.',
      ru: 'Сначала прочитайте весь пересказ: его заголовок и первое предложение показывают, какую часть текста он передаёт, часто всего два-три абзаца. Предскажите тип слова для каждого пропуска, затем сопоставьте перефразированные фразы с текстом и берите точные слова оттуда. Проверьте, что готовое предложение грамматически верно, например множественное число после «many», и что вы не превысили лимит слов.',
    },
  },
  {
    id: 'short_answer',
    node: 'reading.completion',
    name: { en: 'Short-answer questions', uz: 'Qisqa javobli savollar', ru: 'Вопросы с кратким ответом' },
    strategy: {
      en: 'Underline the question word first: what, which, where and how many each ask for a different kind of answer. Locate the information with the key words, which will be paraphrased, and answer with words taken straight from the passage; you do not need a full sentence. The word limit is strict, so leave out words that the question already contains.',
      uz: 'Avval savol so‘zining tagiga chizing: what, which, where va how many har xil javob turini so‘raydi. Kalit so‘zlar yordamida ma’lumotni toping, ular parafraz qilingan bo‘ladi, va javobni to‘g‘ridan-to‘g‘ri matndan olingan so‘zlar bilan yozing; to‘liq gap shart emas. So‘z chegarasi qat’iy, shuning uchun savolda allaqachon bor so‘zlarni takrorlamang.',
      ru: 'Сначала подчеркните вопросительное слово: what, which, where и how many требуют разных ответов. Найдите информацию по ключевым словам, которые будут перефразированы, и отвечайте словами прямо из текста; полное предложение не нужно. Лимит слов строгий, поэтому не повторяйте слова, которые уже есть в вопросе.',
    },
  },
  {
    id: 'multiple_choice',
    node: 'reading.choice',
    name: { en: 'Multiple choice', uz: 'Ko‘p tanlovli savollar', ru: 'Множественный выбор' },
    strategy: {
      en: 'Read the question stem without the options first and find the part of the passage that answers it. Then test every option against that part: wrong options usually repeat words from the passage but change the meaning, mention something true that does not answer the question, or overstate it with words like only or always. The right option is normally a paraphrase, not a copy.',
      uz: 'Avval savolning o‘zini variantlarsiz o‘qing va matnning unga javob beradigan qismini toping. So‘ng har bir variantni o‘sha qism bilan tekshiring: noto‘g‘ri variantlar odatda matndagi so‘zlarni takrorlaydi, lekin ma’noni o‘zgartiradi, savolga javob bermaydigan to‘g‘ri faktni aytadi yoki only, always kabi so‘zlar bilan bo‘rttiradi. To‘g‘ri variant odatda nusxa emas, parafraz bo‘ladi.',
      ru: 'Сначала прочитайте сам вопрос без вариантов и найдите место в тексте, которое на него отвечает. Затем проверьте каждый вариант по этому месту: неверные варианты обычно повторяют слова текста, но меняют смысл, сообщают верный факт, который не отвечает на вопрос, или преувеличивают словами вроде only или always. Правильный вариант, как правило, перефраз, а не копия.',
    },
  },
  // --- Listening ---------------------------------------------------------------------------------
  {
    id: 'form_completion',
    node: 'listening.form',
    name: { en: 'Form completion', uz: 'Shaklni to‘ldirish', ru: 'Заполнение формы' },
    strategy: {
      en: 'Use the time before the recording to predict each gap: a name, a number, a date, a street. Speakers often give a wrong detail first and then correct it ("the fourteenth, no, sorry, the fifteenth"), so write only the final version. Spelled names and numbers must be exactly right, and the word limit counts every word, so "ONE WORD AND/OR A NUMBER" means only one word.',
      uz: 'Yozuv boshlanishidan oldingi vaqtdan har bir bo‘sh joyni taxmin qilish uchun foydalaning: ism, raqam, sana, ko‘cha. So‘zlovchilar ko‘pincha avval noto‘g‘ri ma’lumot aytib, keyin tuzatadi («the fourteenth, no, sorry, the fifteenth»), shuning uchun faqat oxirgi variantni yozing. Harflab aytilgan ismlar va raqamlar mutlaqo aniq bo‘lishi kerak; so‘z chegarasi har bir so‘zni hisoblaydi, «ONE WORD AND/OR A NUMBER» faqat bitta so‘z degani.',
      ru: 'До начала записи предскажите каждый пропуск: имя, число, дата, улица. Говорящие часто сначала называют неверную деталь, а потом исправляются («the fourteenth, no, sorry, the fifteenth»), поэтому записывайте только окончательный вариант. Имена по буквам и числа должны быть абсолютно точными, а лимит считает каждое слово: «ONE WORD AND/OR A NUMBER» — это только одно слово.',
    },
  },
  {
    id: 'note_completion',
    node: 'listening.form',
    name: { en: 'Note and table completion', uz: 'Qayd va jadvalni to‘ldirish', ru: 'Заполнение заметок и таблиц' },
    strategy: {
      en: 'Notes follow the order of the talk, so the headings show you where you are; if you miss a gap, move on to the next one instead of losing two. Predict the word type from the note around each gap and listen for the paraphrase of the note, not the same words. Write the words you hear, check plurals and spelling at the end, and stay within the word limit.',
      uz: 'Qaydlar nutq tartibida boradi, shuning uchun sarlavhalar qayerda ekaningizni ko‘rsatadi; bitta bo‘sh joyni o‘tkazib yuborsangiz, ikkitasini yo‘qotmaslik uchun keyingisiga o‘ting. Har bir bo‘sh joy atrofidagi qaydga qarab so‘z turini taxmin qiling va aynan o‘sha so‘zlarni emas, qaydning parafrazini tinglang. Eshitgan so‘zlaringizni yozing, oxirida ko‘plik va imloni tekshiring, so‘z chegarasidan chiqmang.',
      ru: 'Заметки идут в порядке выступления, поэтому заголовки показывают, где вы находитесь; если пропустили один пропуск, переходите к следующему, чтобы не потерять два. По тексту заметки предскажите тип слова и слушайте перефраз заметки, а не те же самые слова. Записывайте услышанные слова, в конце проверьте множественное число и орфографию, не выходите за лимит.',
    },
  },
  {
    id: 'listening_multiple_choice',
    node: 'listening.choice',
    name: { en: 'Multiple choice (listening)', uz: 'Ko‘p tanlovli savollar (listening)', ru: 'Множественный выбор (listening)' },
    strategy: {
      en: 'Read the question and underline how the options differ before the audio starts. Usually every option is mentioned, so do not choose the first one you hear: listen for the one the speaker confirms, and for the words that rule the others out (but, actually, that was before, not any more). The answer is usually said in different words from the option.',
      uz: 'Audio boshlanishidan oldin savolni o‘qing va variantlar bir-biridan nimasi bilan farq qilishining tagiga chizing. Odatda hamma variant tilga olinadi, shuning uchun birinchi eshitganingizni tanlamang: so‘zlovchi tasdiqlagan variantni va qolganlarini inkor etuvchi so‘zlarni (but, actually, that was before, not any more) tinglang. Javob odatda variantdagidan boshqa so‘zlar bilan aytiladi.',
      ru: 'До начала аудио прочитайте вопрос и подчеркните, чем различаются варианты. Обычно упоминаются все варианты, поэтому не выбирайте первый услышанный: слушайте тот, который говорящий подтверждает, и слова, исключающие остальные (but, actually, that was before, not any more). Ответ обычно звучит другими словами, чем в варианте.',
    },
  },
  {
    id: 'listening_matching',
    node: 'listening.matching',
    name: { en: 'Matching (listening)', uz: 'Moslashtirish (listening)', ru: 'Сопоставление (listening)' },
    strategy: {
      en: 'The items in the question come in the order you will hear them, but the options do not, so keep your eyes on the item list and hold the options in mind. Several options will be mentioned for each item; wait for the one the speaker finally attaches to it. Some options are never used, and if you miss one item, guess and move on so you are ready for the next.',
      uz: 'Savoldagi bandlar eshitiladigan tartibda keladi, variantlar esa yo‘q, shuning uchun ko‘zingizni bandlar ro‘yxatida tuting va variantlarni yodda saqlang. Har bir band uchun bir nechta variant tilga olinadi; so‘zlovchi oxir-oqibat unga bog‘lagan variantni kuting. Ba’zi variantlar umuman ishlatilmaydi; bitta bandni o‘tkazib yuborsangiz, taxmin qilib, keyingisiga tayyor bo‘ling.',
      ru: 'Пункты задания звучат в том порядке, в каком они перечислены, а варианты — нет, поэтому держите взгляд на списке пунктов, а варианты в памяти. Для каждого пункта прозвучит несколько вариантов; дождитесь того, который говорящий окончательно с ним связывает. Некоторые варианты не используются вовсе; если пропустили пункт, угадайте и будьте готовы к следующему.',
    },
  },
];

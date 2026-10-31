## Engage stories (supabase/functions/schood-ai/engage/content/stories.ts)
Counts: language 5 · fact 2 · answer 0 · consistency 12 · honesty 0 · placeholder 0

All 3 × 21 authored check questions re-checked against the scene/dialogue: every key is right and
supported; distractors are clearly wrong. Level per episode is on target (A1 present simple/can, A2
past simple, B1 mixed tenses, B2 complex sentences, C1 argument and nuance); no rewrites for level
were needed.

### Changes
- `stories.ts:57` (language, uz lead) "Madina Samarqanddan kichik kafe-kitob do‘koniga ishlash uchun
  keladi va … kutib turgan xatni topadi" → "Madina kichik kafe va kitob do‘konida ishlash uchun
  Samarqanddan Toshkentga keladi va u yerda 1998-yildan beri kutib yotgan xatni topadi": word order,
  and "kafe-kitob do‘koni" is not a phrase.
- `stories.ts:58` (language, ru lead) "переезжает … работать в маленькое кафе-книжный … письмо,
  ждавшее с 1998 года" → "переезжает из Самарканда, чтобы работать в маленьком кафе при книжном
  магазине, и находит письмо, которое ждёт своего часа с 1998 года": wrong case (в маленькое →
  в маленьком), «кафе-книжный» is not a word.
- `stories.ts:132` e02 listen (consistency) "Nine o’clock every day." → "Nine o’clock, Monday to
  Saturday.": e04 is Madina's "Day Off" on Sunday; "every day" contradicted it.
- `stories.ts:149` e06 beat (consistency) "a photo of a young Rustam … 1998" → "a younger Rustam":
  Rustam is about 70 in the story's present (letter written 25+ years ago), so in 1998 he was in his
  40s; they studied together much earlier. The AI-written episode would otherwise call a 44-year-old
  "young".
- `stories.ts:177` e07 gloss (language) handwriting uz "qo‘lyozma" (= manuscript) → "dastxat".
- `stories.ts:194` e08 (consistency) "She got married, then she had a family" → "She was married and
  had a family": she was 47 in 1998 and is still "Elizabeth Hart" (Grace finds her by that name);
  the gloss word "married" is kept.
- `stories.ts:260` e14 (language) "he posted a photo … By the evening it had two hundred new
  followers" → "the channel had…": "it" read as the photo.
- `stories.ts:273` e14 q3 (consistency) options "She wanted a job / She saw the Telegram post / She
  wanted to sell books" → "To ask about a job / Because of the Telegram post / To sell some old
  books": the speaker is just "Customer" and is read by the device voice; nothing makes them female.
  Key unchanged (b).
- `stories.ts:303` e19 listen (consistency) "So who told the press about the negotiations? Because it
  wasn’t us." → "So who told the press the price?": the shop itself told Nigora about BookCity's
  pressure (that is the article), and with the e14 choice `channel=share` Timur posted the offer, so
  "it wasn't us" was false. The point Madina just made, and that e26 resolves (the leak came from
  Karimov's office), is the price.
- `stories.ts:326` e20 (fact) "I wrote it twenty-six years ago" → "more than twenty-five years ago":
  1998 + 26 fixes the story in 2024, but it is "present-day" and ships in 2026; also "If anyone was
  going to read it" → "If anyone else…": Rustam read it in 1998 (he kept the blue book as asked).
- `stories.ts:338,345` e20 listen + q3 option (consistency) "for the book festival" → "for the book
  fair": e25 names the event the Tashkent International Book Fair. Key unchanged (a).
- `stories.ts:352` e23 beat (consistency) "raise money to repair the window" → "to pay for the window
  repair": the window broke in e05, many weeks earlier.
- `stories.ts:398` e26 (fact) "Ms Hart as a guest author" → "guest speaker": Elizabeth is a retired
  literature teacher, never presented as an author.
- `stories.ts:431-432` sales lead (language) uz "reja … uzun navbatli kafe va yarim narxdagi
  raqobatchi" → "sotuv rejasi … navbati uzun kafe va ikki baravar arzon raqobatchi"; ru "план" →
  "план продаж", "Двадцать рабочих дней уровня B1" → "…на уровне B1".
- `stories.ts:558` d04 opening `next_step=message` (consistency) "She had answered in three minutes."
  → "she had answered it within the hour": the d03 cliffhanger says her voice message came "An hour
  later".
- `stories.ts:624` d06 opening `summary=javlon` (consistency) "Javlon had liked the one-page summary so
  much…" → "You had dropped Javlon’s copy at the café anyway. He had liked it so much…": the demo was
  cancelled an hour before, so without this he never got it (the `nodira` opening says her copy is
  still in your bag).
- `stories.ts:641,650` d06 listen + q3 (consistency) Kamila "She cancelled on me too, in March." →
  "…when I had Chilanzar."; question "…cancelled in March?" → "…cancelled on her?": Kamila started
  one week before you (d01), so March made no sense; ties to d02 ("I used to have Chilanzar"). Key
  unchanged (b).
- `stories.ts:659` d07 opening `nephew=expert` (consistency) "Ulugbek had agreed to come on Tuesday…
  wear a tie" → "Ulugbek couldn’t come on Tuesday, but on Friday afternoon he gave you half an hour
  and explained how KassaPro works.": d08's authored scene has no Ulugbek at the demo ("you remember
  something Ulugbek said", "I don't know. I'll find out"), so with this choice the story contradicted
  itself.
- `stories.ts:722` d10 beat (consistency) "At the end of the trial you ask…" → "On day ten of the
  trial, as you promised, you ask…": the trial is fourteen days (d01, d08); "day ten" is the promise
  in d08 and Dilfuza's warning.

### [VERIFY]
- `stories.ts` sales arc timeline: Days 1–8 are consecutive working days (Day 5 = Thursday, Day 7 =
  Monday, Day 8 = Tuesday, so Day 1 is a Friday), but the d08 cliffhanger "On day nine Javlon calls"
  is trial day nine, and the trial started on Day 8. The "Day N" titles and "Twenty working days" in
  the lead cannot all be literal. Not fixable by wording alone; the author should decide whether
  "Day N" means episode N (then drop "working days" from the lead) or move the trial dates.
- `stories.ts:356` e25 "Tashkent International Book Fair": a real event name used for the fiction;
  fine as a setting, but if the real fair is not held in May the e20 "in May" is a small mismatch.
  I did not check the real fair's dates.

## Engage journeys (supabase/functions/schood-ai/engage/content/journeys.ts)
Counts: language 38 · fact 3 · answer 0 · consistency 30 · honesty 7 · placeholder 0

### Changes
- (honesty) Journey names read as promises; reworded to a target or a programme length in all three
  languages (keys unchanged; no test asserts the names):
  - `ielts_55_70` "IELTS 5.5 → 7.0 in 16 weeks" / "IELTS 5.5 → 7.0, 16 haftada" / "IELTS 5.5 → 7.0 за
    16 недель" → "Towards IELTS 7.0: a 16-week programme" / "IELTS 7.0 sari: 16 haftalik dastur" /
    "К IELTS 7.0: программа на 16 недель". The 5.5 starting point moved into the lead ("For learners
    at about band 5.5 aiming for 7.0: …", uz/ru the same).
  - `speaking_60` "Speaking confidence in 60 days" / "60 kunda gapirishga ishonch" / "Уверенная речь за
    60 дней" → "Speaking confidence: a 60-day programme" / "Gapirishga ishonch: 60 kunlik dastur" /
    "Уверенная речь: программа на 60 дней".
  - `docs/product/44_SCHOOD_AI.md:175` still quotes the old names (not my file; for the lead).
- (honesty) IELTS week 4 "a real number to beat" / "haqiqiy ball" / "реальный балл" → "an estimated
  band to improve on" / "taxminiy ballingiz" / "примерный балл" (coach scores are estimates); week 12
  "predicted band" / "Bashorat qilingan" / "прогнозный" → "estimated" / "Taxminiy" / "примерный";
  week 1 "so you can hear the change later" → "so you have something to compare with later" (uz/ru
  the same; no presumed change); speaking graduation "The Speaking B1 certificate exam can prove it to
  others" (a level exam does not prove progress) → "To show your level to others, the next step is the
  English Speaking B1 certificate exam" (uz/ru the same, with the exam's real name).
- (fact) IELTS Listening has Parts 1–4, not sections: "Listening, sections 1 and 2 / 3 and 4" →
  "Parts 1 and 2 / 3 and 4"; uz "1- va 2-bo‘limlar" → "1- va 2-qismlar"; ru "разделы" → "части"
  (glossary).
- (fact) IELTS week 5 "Save your first essay" in the Task 1 week → "your first piece of writing" (uz
  "Birinchi yozma ishingizni «oldin va hozir» namunasi sifatida saqlang", ru "первую письменную
  работу").
- (consistency) Coach names per the pack manifests and glossary: uz/ru "IELTS Coach" → "IELTS
  murabbiyi" / "IELTS-коуч(ем)"; "Sales Coach" → "Savdo murabbiyi" / "коуч по продажам"; "Speaking
  Partner" → "Ingliz tili suhbatdoshi" / "разговорный партнёр (по английскому)"; "Public Speaking
  Coach" → "Notiqlik murabbiyi" / "коуч публичных выступлений"; ru "тренер" → "коуч"; uz "Coach" →
  "Murabbiy". Section name «Coach eslab qoladi» / «Что помнит тренер» → «Murabbiy nimani eslab
  qoladi» / «Что помнит коуч», which is what the UI catalogs now say.
- (consistency) Glossary terms: journey uz "yo‘li" / ru "Путь" → "dasturi" / "Программа"; cue card
  uz "savol kartasi" / ru "карточка" → "mavzu kartochkasi" / "карточка с темой"; feedback uz "Fikr" /
  ru "разбор" → "Fikr-mulohaza" / "обратная связь"; scorecard uz "baholash kartasi" / ru "оценочная
  карта" (5×) → "natija kartasi" / "карта результата"; closing uz "Bitimni yopish" → "Bitim tuzish";
  follow-up uz "Kuzatuv" → "Keyingi aloqa (follow-up)"; discovery ru "Выявляющие вопросы" → "Вопросы
  для выявления потребностей"; value uz "Qiymat taqdimoti" → "Foydani ko‘rsatadigan taqdimot";
  trade a concession uz "Almashing, tekin bermang" → "Faqat evaziga yon bering", ru "Обменивайтесь, не
  уступайте даром: каждая скидка что-то покупает" → "Уступайте только в обмен: за каждую скидку вы
  что-то получаете"; shadowing uz "Takrorlash (shadowing)" → "Shadowing (takrorlash mashqi)"; mock ru
  "пробные Speaking" / "Финальный экзамен" → "пробные экзамены по Speaking" / "Финальный пробный
  экзамен"; uz "3-sinov" → "3-sinov imtihoni" (matches "1-sinov imtihoni"); certificate names in the
  graduation leads → «Savdo, 1-daraja», «Продажи, уровень 1», «Ingliz tili nutqi B1», «Разговорный
  английский B1».
- (language, uz) record = "yozib oling", not "yozing" (= write), 10 ×; "vaqtli" (timed) → "vaqt
  cheklangan" 5 ×; "Takrorlanuvchi" → "Takrorlanadigan"; "Kichik suhbat" (calque of small talk) →
  "Yengil suhbat"; "Hikoya qiling" → "Hikoya aytib bering"; "Shakllar … sababsiz yo‘qotiladigan" →
  "Anketalar … bekorga yo‘qotiladigan"; "Sarlavhalar, belgilar va xulosalar, vaqt bilan" → glossary
  "qisqacha mazmunni to‘ldirish"; "birinchi kun yonida" → "birinchi kundagisi bilan yonma-yon"; "o‘n olti
  haftalik bob" → "har hafta bir bob, jami o‘n olti bob" (same for 13 and 9); "«First Month on the
  Floor»ning" → "«…» hikoyasining"; "To‘rtta narx e’tirozi hal qilindi" (past tense as a task) → "Narx
  bo‘yicha to‘rtta e’tirozga javob"; and others of the same kind.
- (language, ru) "Формы, числа и написание … без причины" → "Анкеты, числа и орфография … зря";
  "small talk" → "светскую беседу"; "строгую коррекцию" → "строгий режим исправлений"; "реальный
  экзамен" → "официальный экзамен"; "(6, 7 и 8 рядом)" → "(баллы 6, 7 и 8 рядом)"; "Заголовки,
  признаки и резюме" → "Заголовки, сопоставление признаков и заполнение краткого содержания".
- (language, en) "Half way" → "Halfway"; "at week 16" → "in week 16"; "(band 6, 7 and 8 …)" → "(bands
  …)"; "Two first role-plays" → "Your first two role-plays"; graduation "Book the real exam with your
  date in …" → "Book the official exam, add its date to …"; week 9 "Two story episodes at B1 or above"
  → "Two Tashkent Lights episodes at B1 or above" (the task only counts that arc).

## Engage path (content/path.ts)
Counts: language 7 · fact 0 · answer 0 · consistency 6 · honesty 1 · placeholder 0
### Changes
- (consistency) "Admission Maths Coach" in uz/ru → "OTMga kirish bo‘yicha matematika murabbiyi" /
  "коуч по математике для поступления"; "IELTS Coach" → "IELTS murabbiyi" / "IELTS-коуч"; uz "yo‘l" /
  ru "путь" for the IELTS journey → "dastur" / "программа"; uz "coach" / ru "тренер" → "murabbiy" /
  "коуч"; ru "мини-экзамены" → "мини-пробники"; ru "интервью" → "собеседования" (glossary: job
  interview); ru "разбор" → "обратная связь".
- (language) uz "Universitetga ariza inshosi" → "…insholari"; "Talaba vizasi suhbati" → "Talabalik vizasi
  bo‘yicha suhbat" (glossary); "Baholangan hisobotli ovozli sinov suhbatlari … sanali ma’lumotlardan" →
  "Ovozli sinov suhbatlari va baholangan hisobot … sanasi ko‘rsatilgan ma’lumotlardan"; "Imtihon ishidan
  oldin … nutqlar" → "Imtihonga tayyorgarlikdan oldin … nutq mashqlari"; "Rezyume, xatlar, …" →
  "Rezyume, motivatsion xatlar, …"; "Sales sertifikatlari" / "сертификаты Sales" → "savdo
  sertifikatlari" / "сертификаты по продажам"; ru "датированных данных" → "данных с указанной датой".
- (honesty) public speaking "with weekly progress" / "haftalik o‘sish bilan" / "с еженедельным
  прогрессом" (reads as promised growth) → "with a weekly progress report" / "haftalik o‘sish hisoboti
  bilan" / "с еженедельным отчётом о прогрессе".

## Engage seasons (content/seasons.ts)
Counts: language 7 · fact 1 · answer 0 · consistency 5 · honesty 0 · placeholder 0
No fake urgency, no prizes or sponsors in the authored text (sponsors are admin-set), nothing random.
### Changes
- (consistency) Q1 lead "the first chapters of Tashkent Lights" → "the first episodes" (a story has
  episodes; chapters belong to journeys); uz "ilk boblari" → "ilk qismlari", ru "первые главы" →
  "первые эпизоды". Also "a speaking reset" / "nutqni qayta boshlash" / "перезапуск речи" (calques) →
  "a fresh start for your speaking" / "nutq mashqlarini yangidan boshlash" / "разговорная практика с
  чистого листа".
- (fact) Q4 "with the sales tournament" → "with the monthly sales tournament" (uz "har oylik", ru
  "ежемесячным"): tournaments run every month, not only in this season.
- (consistency) "IELTS Coach" / "Sales Coach" / "coach’i" / "тренер" → glossary names; ru "пробник(и)" in
  running text and in the event title → "пробный экзамен".
- (language, uz) "Yozgi xorij" → "Xorijda yoz"; "Ariza inshosi" → "Ariza insholari"; "vaqtli" → "vaqt
  cheklangan"; "nutq navbatlari" (turns, calque) → "og‘zaki javoblar"; "rolli qo‘ng‘iroqlar" → "rolli
  o‘yin tarzidagi … qo‘ng‘iroqlar"; "natijangizni belgilaydi" → "natijangiz … bo‘yicha hisoblanadi";
  "bir xil dam olish kunida" → "kunlarida" (Saturday and Sunday).
- (language, ru) "Итог — пять ваших лучших баллов" (the result is their average) → "Итог считается по
  пяти вашим лучшим баллам"; "в одни выходные" → "в одни и те же выходные".

## Engage certificates (content/certificates.ts)
Counts: language 3 · fact 0 · answer 0 · consistency 2 · honesty 4 · placeholder 0
All 40 exam items checked: each has exactly one right option and the keys are correct (BATNA,
anchoring, "Not at all", "since", third conditional, "I wish I had").
### Changes
- (honesty) Every exam lead now ends "A Schood certificate, not an official exam result." (speaking) /
  "…, not an official qualification." (sales); uz "Bu Schood sertifikati, rasmiy imtihon natijasi emas." /
  "…, rasmiy malaka hujjati emas."; ru "Это сертификат Schood, а не результат официального экзамена." /
  "…, а не официальная квалификация." (glossary honesty rule: certificate texts say so). Also ru
  "экзаменатор" → "подготовленный проверяющий" (the code says a trained reviewer; "экзаменатор"
  suggests an exam board); en "…, marked by a reviewer" → "that a trained reviewer marks" (the comma
  made the auto-marked questions look human-marked too).
- (consistency) Sales rubric: uz "Aniqlovchi savollar" → "Ehtiyojni aniqlovchi savollar", ru
  "Выявляющие вопросы" → "Вопросы для выявления потребностей"; uz "Mijoz tilida qiymat" → "Mijoz nuqtai
  nazaridan foyda" (glossary value = foyda).
- (language) B1 i2 "Which is the most polite?" → "Which is the most polite thing to say?"; uz "yozib
  olingan nutq vazifasi, tekshiruvchi baholaydi" → "yozib olinadigan nutq vazifasi; vazifalarni
  tayyorlangan tekshiruvchi baholaydi".

## Engage text (content/text.ts)
No learner-facing text (only `pick` and `fill`). No changes.

## Tests
- `deno test --no-lock supabase/functions/schood-ai/engage/`: 61 passed, 0 failed.
- `deno check --no-lock` on the five edited content files: clean.

### Glossary proposals
- Timed (practice, set): uz "vaqt cheklangan" (not "vaqtli"), ru "на время". Packs and engage both use
  "vaqtli", which reads oddly.
- Record (voice): uz "yozib oling" (never "yozing", which means write).
- Small talk: uz "yengil suhbat", ru "светская беседа".
- Journey names: en "<target>: a N-week programme", uz "<target> sari: N haftalik dastur", ru
  "К <target>: программа на N недель"; never "X → Y in N weeks".

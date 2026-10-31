## B2 English Speaking Partner, core (`packages/coach-packs/speaking/`: manifest.ts, diagnostic.ts, rubrics.ts, plan.ts, samples.ts, shadowing.ts, phrases.ts, index.ts, calibration.ts rationale only)
Counts: language 47 · fact 8 · answer 0 · consistency 9 · honesty 5 · placeholder 0

Every line in scope was read. `index.ts` has no learner text. All placement keys (24 items) checked: each has one right
option, natural English, no change needed. No placeholder was broken: every reminder has the same placeholders in
en/uz/ru, and `{minutes}` is always the daily-minutes option (10/15/20/30), so «{minutes} минут» always agrees.
Edits were scripted with exact single-match checks; CRLF kept.

### Changes

**manifest.ts**
- `description` (honesty) en "Voice role-plays with **people** who react" → "with **characters** who react": the personas
  are AI, "people" suggests real humans. uz "suhbatdoshlar" → "personajlar" (glossary), ru "собеседниками" → "персонажами".
- `description.uz` (language) "**Boshlovchilarga** tushuntirishlar…" ("to TV hosts/presenters") → "Boshlang‘ich
  darajadagilarga tushuntirishlar … beriladi"; "Talaffuz uchun gaplarni takrorlang" → "Talaffuzingiz ustida ishlash uchun
  gaplarni ortidan takrorlang"; "tuzatishni tanlang" → "tuzatish rejimini tanlang" (matches the /settings command).
- `description.ru` (consistency/language) "(shadowing)" → "(шэдоуинг)", "ролевые диалоги с собеседниками" → "ролевые игры
  с персонажами", "мягкую или строгую коррекцию" → "мягкий или строгий режим исправлений" (as in /settings),
  "словарный запас" → "разнообразие лексики" (it is a range metric), added "чтобы работать над звучанием речи" to match en.
- (consistency) Phrase bank uz "Iboralar banki" → "Iboralar to‘plami" (skill name, menu, description), per glossary.
- (consistency) Role-play menu label and /roleplay command: uz "Rolli suhbat(ni boshlash)" → "Rolli o‘yin(ni boshlash)",
  ru "Ролевой диалог / Начать ролевой диалог" → "Ролевая игра / Начать ролевую игру" (glossary). Shadowing menu uz
  "Takrorlash (shadowing)" → "Shadowing (takrorlash)" (glossary order, 22 chars).
- errorTags (language): `pronouns_gender.uz` word order "«u» bitta so‘z — ham erkak…" → "erkak, ayol va narsa uchun bitta
  so‘z — «u» ishlatiladi"; `articles.ru` "перед общим множественным" → "перед множественным числом в общем значении";
  `prepositions.uz` "Soat va nuqta uchun" (calque) → "Soat va aniq joy uchun", "ichki joy" → "biror narsaning ichi";
  `prepositions.ru` "и точек", "внутренних пространств" → "и конкретного места", "пространства внутри чего-то";
  `false_friends.en` "magazine is a journal" (an English *journal* is an academic publication) → "a magazine is something you read".

**diagnostic.ts**
- intro (honesty) en "your first role-plays will make it **precise**" → "more accurate" (no score is precise).
  uz "Sun’iy intellekt" → "AI" (glossary), "fikrlar" (thoughts) → "gaplar", "nutq darajangiz" → "og‘zaki nutq darajangiz",
  "rolli suhbatlaringiz" → "rolli o‘yinlaringiz"; ru "ролевые диалоги" → "ролевые игры".
- `c1.en` (language) "without long stops" → "without long pauses".
- `c7` (fact, CEFR) "speak **naturally and quickly**" → "**fluently and spontaneously**", which is the C1 fluency meaning
  (speed is not the C1 marker); uz "tabiiy va tez" → "ravon va erkin"; ru "редко подбираю слова" (= "I rarely choose words")
  → "мне редко приходится подбирать слова".
- `c8.uz` "odob bilan" → "nazokat bilan" (tactfully).

**rubrics.ts**
- fluency 2 (consistency) "Pace is usually **well under about** 80 wpm" → "often below about 80 wpm": the A2 comfortable band in
  `plan.ts` is 60–110 wpm, so "well under 80" contradicted the engine's own band.
- pronunciation 5 (language) "Any accent never affects intelligibility." → "An accent, if any, never affects intelligibility."
- All descriptors checked against the CEFR (2020) scales for vocabulary range, grammatical accuracy, spoken fluency,
  overall interaction and phonological control: meaning and level match, wording is Schood's own.

**plan.ts (reminders)**
- daily 1 uz (honesty) "Har kuni qisqa suhbat — nutqni rivojlantirishning **eng yaxshi yo‘li**" ("the best way", a stronger
  claim than en) → "Nutq har kungi qisqa suhbatlar bilan o‘sadi."
- daily 3 uz "Bugungi mashq" → "Bugungi vazifa" (glossary example), "{coach} sizni kutyapti" (pressure) → "{coach} siz tayyor
  bo‘lganingizda shu yerda" (= "ready when you are").
- daily 4 ru "Пять минут **говорения** полезнее часа чтения о нём" → "Пять минут разговора полезнее часа чтения о том, как говорить".
- daily 6 uz "Ovozingiz har safar ishlatganingizda" (calque) → "Har safar gapirganingizda ovozingiz…".
- daily 7 (honesty) "Small talk, **big progress**" → "steady progress"; uz "katta natija" → "barqaror o‘sish";
  ru "большой шаг" → "ещё шаг вперёд".
- comeback 1 uz "kecha sizni sog‘indik" (intimate "we longed for you") → "kecha sizni ko‘rmadik".
- countdown 1 uz/ru role-play term → "rolli o‘yin" / "Одна ролевая игра сегодня — и вы ещё ближе к цели";
  countdown 2 ru "Сверим цель" → "Сверимся с целью".

**shadowing.ts** (all 48 sentences and focus notes checked phonetically)
- a2-02 (fact) "Link “cup of” **into one sound**" → "together" (it is one unit, not one sound); uz likewise "bir-biriga ulang".
- a2-07 uz "bir tekis ibora qilib" → "bir nafasda, silliq".
- a2-08 (fact) "/v/ with the top teeth on **the lip**" → "on your **bottom** lip" (en/uz/ru).
- b1-09 uz "so‘roq qo‘shimchasi" (= question suffix) → "qisqa so‘roq (question tag)".
- b1-10 (fact) "I thought the film was a bit too long.": "Stress “bit” and “long”" → "Stress “film” and “too long”"
  ("a bit" is unstressed here); en/uz/ru.
- c1 title uz "nozik ma’no va odob" → "nozik ma’nolar va nazokat" (nuance and tact).
- c1-04 uz translation "men **endigina** sizga qo‘ng‘iroq qilmoqchi edim" ("I had just recently wanted to") →
  "men hozir sizga qo‘ng‘iroq qilmoqchi bo‘lib turgandim" (= "I was just about to").

**phrases.ts** (104 cards: front, meaning, translations, example, situation, distractors; no distractor is also right)
- (language, en) "Please, help yourself." → "Please help yourself." (front and example); "Sorry, I think this isn’t what I
  ordered." → "Sorry, I don’t think this is what I ordered." (front and example).
- (fact) `health.been-feeling` meaning "Use “have been” + “for”" → "Use “have been” + -ing, and “for” with a period of time".
- (consistency) `health.no-other-medicine` example question "Are you taking anything" → "anything else", so "any other
  medicine" in the answer fits.
- ru (language): "О, звучит здорово!" (calque) → "О, как здорово!"; "Есть такое же размера M?" → "А есть такое же в размере M?";
  "больше, чем я планировал потратить" → "дороже, чем я рассчитывал"; "с менеджером" (shop) → "с администратором";
  "справку для работы" → "справку на работу"; "Как я это вижу" (calque) → "На мой взгляд"; "Повторите, пожалуйста?" →
  "Можете повторить?"; "прислать это мне по почте" (= post) → "прислать мне это по электронной почте";
  deck titles "Просьба о помощи и дорога" → "Как попросить помощи и спросить дорогу", "Рабочие встречи и мнения" →
  "Рабочие встречи: как высказать мнение".
- uz (language): "Katta rahmat, juda katta yordam berdingiz" → "Katta rahmat, menga juda yordam berdingiz"; "Bu yerga yaqin
  bankomat bormi?" → "Shu atrofda bankomat bormi?"; "sanchiqli og‘riqdan ko‘ra ko‘proq simillagan og‘riq" → "Bu o‘tkir og‘riq
  emas, ko‘proq simillab og‘riyapti"; "budjet" → "byudjet"; "o‘rtacha yechimga kelarmiz" (calque) → "murosaga kelarmiz";
  "Ko‘rib chiqish uchun birorta xodimni" → "Ko‘rib berish uchun biror kishini"; deck title "Shifokor va dorixonada" →
  "Shifokor qabulida va dorixonada".

**samples.ts**
- (fact) Plan sample preview said "a role-play every day … **two** shadowing sessions"; the week has three shadowing tasks
  (Tue, Thu, Sat) and Sunday is rest → "a role-play every day except Sunday … three shadowing sessions" (en/uz/ru).
- (fact) Hotel review goal quote "I’m calling from room **305**" → "room **412**": the role-play (`rp.hotel-room-problem`)
  gives the learner room 412, and the review ticks this goal as met.
- (honesty) Pronunciation note "A shadowing set gives you feedback on how you sound" overclaimed: shadowing only compares the
  transcript with the sentence (`flows/drills.ts` `shadowMatch`) → "In shadowing you can see which of your words come
  through clearly"; uz/ru likewise.
- (language) uz "**Uydirma** o‘quvchi" ×3 ("made-up", reads as "fabricated/lie") → "To‘qima o‘quvchi" (fictional);
  uz notes: "so‘z yetarli" → "so‘zlaringiz yetdi", "savoldagi tartib" → "savoldagi so‘z tartibi", "kam to‘xtab gapirdingiz"
  → "uzoq pauzalar kam bo‘ldi", "Iltimos aniq, … tekshirib olish ham yaxshi" → "Iltimosingiz aniq, xona raqamini qayta so‘rab
  tekshirganingiz ham yaxshi"; ru "Две модели для исправления" → "Две ошибки, которые стоит исправить"; plan title uz
  "B1+ ga 12 haftalik rejaning bir haftasi" → "B1+ darajasiga 12 haftalik rejadan bir hafta"; en focus line dropped the
  doubled "?”." punctuation.
- (consistency) Terms in titles, labels and the 20 plan tasks aligned with the glossary and with the renamed deck titles:
  6 × uz "Rolli suhbat:" → "Rolli o‘yin:", 6 × ru "Ролевой диалог:" → "Ролевая игра:", 6 × "Iboralar banki" → "Iboralar
  to‘plami", 3 × ru "Тренажёр:" → "Упражнение:" (and "тренажёры" in two notes), uz "karta(lar)" → "kartochka(lar)", weekly-report
  row labels ("rolli o‘yin", "ролевая игра"), deck titles in tasks match phrases.ts.
- Scores checked: review criteria 3 / 2.5 / 3 / 3 → overall 2.875 → B1 by `round: 'step'`, as the preview says; the quotes
  fit the descriptors; 104 wpm sits in the B1 band; 3 questions asked matches the quotes; every day of the plan adds up to 15 min.

**calibration.ts** (rationale only; no learner text or evidence touched)
- s09 (fact) "the **embedded question** “how long I should take them”" → "statement order in the question …": it is a
  direct question, not an embedded one.
- s01 (language) "missing subject and “be” pattern in “Is very cold today”" (the "be" is there) → "the missing subject in …".

### [VERIFY]
- `diagnostic.ts` g7 (`I wish I had bought…`) is tagged level 5 (C1); wish + past perfect is usually B2 (English Profile).
  g4 (`where can I buy`, question order with a modal) is tagged 3 (B1); it is usually A2. I did not change `level` values
  (they drive scoring); owner to decide.
- `plan.ts` `fluency.pace` bands (A2 60–110 … C1 115–170 wpm) are authoring assumptions, not CEFR figures. Rubric text now
  agrees with them; the numbers themselves are unverified.
- Russian translations of phrases/sentences use the masculine form (не расслышал, заблудился, заказывал, рассчитывал,
  забронировал). Not wrong, but a female learner sees "he" forms; consider "(а)" or neutral wording if wanted.
- uz "zamogi buzilgan" (zip) is Tashkent colloquial; "molniyasi" is the alternative. Left as is.

### Glossary proposals
- Role-play: glossary says rolli o‘yin / ролевая игра, but the coach UI (`coach.slot.roleplay`: uz "rolli suhbatlar",
  ru "ролевые диалоги") and `career/manifest.ts` menu ("Rolli suhbatlar") use the other form. I aligned the Speaking pack
  to the glossary; the UI and Career owners should do the same (or the glossary should accept one form; not both).
- Shadowing button (uz): add the short form "Shadowing (takrorlash)" for buttons; `routes.ts` uses "Takrorlab gapirish".
- Fictional learner (samples): add uz "to‘qima o‘quvchi" (never "uydirma"), ru "вымышленный ученик / вымышленная ученица".
- Correction mode: add uz "tuzatish rejimi" (yumshoq / qat’iy), ru "режим исправлений" (мягкий / строгий).
- Speaking level: add uz "og‘zaki nutq darajasi", ru "разговорный уровень".

### Checks run
- `deno run --no-lock --allow-read packages/coach-packs/scripts/check.ts speaking`: ✓ 38 activities, 1 rubric, 24 items.
- `deno run --no-lock --allow-read packages/coach-packs/scripts/calibration.ts speaking`: ✓ exact 0.785, adjacent 1,
  MAE 0.108, spread 0.5, evidence 0.965.
- `deno test --no-lock packages/coach-packs/test/`: 22 passed, 0 failed.
- `deno test --no-lock supabase/functions/schood-ai/coach/`: 32 passed, 0 failed. No test asserts a string I changed.

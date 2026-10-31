# Review log: B1 IELTS Coach, core files

Reviewer scope: `packages/coach-packs/ielts/` `manifest.ts`, `diagnostic.ts`, `rubrics.ts`, `writing.ts`,
`speaking.ts`, `samples.ts`, `plan.ts`, `index.ts`, and the rationale/notes in `calibration/speaking.ts`,
`calibration/writing_task1.ts`, `calibration/writing_task2.ts`. Every line read. No learner text or
evidence quote in the calibration files was touched; no keys, ids, structure, option order or counts changed.

Checks run at the end: `check.ts ielts` ✓, `calibration.ts ielts` ✓ (all three rubrics, metrics unchanged),
`deno test --no-lock packages/coach-packs/test/` 22 passed, `deno test supabase/functions/schood-ai/coach/` 32 passed.

## manifest.ts
Counts: language 19 · fact 0 · answer 0 · consistency 2 · honesty 2 · placeholder 0
### Changes
- `manifest.ts:12-16` (honesty) tagline claimed "A full IELTS examiner…: bands with evidence" (ru «Полноценный экзаменатор»).
  The coach is not an examiner and its bands are estimates → "An examiner-style IELTS coach in Telegram: estimated
  bands backed by evidence and a plan to your exam date." uz "imtihonchi kabi baholaydigan IELTS murabbiyi: dalilli
  taxminiy ballar…", ru "IELTS-коуч в Telegram, который оценивает как экзаменатор: примерные баллы с цитатами…".
  Lengths 107/111/109 (≤120).
- `manifest.ts:18-20` (honesty, language, consistency) description: en "a band per criterion quoted from your own words"
  (a band is not quoted) → "an estimated band per criterion backed by quotes from your own words". uz: + "taxminiy",
  "rasm" → "surat", "vaqtli" → "vaqt belgilangan", "haqiqiy vaqt bilan" → "imtihondagidek vaqt bilan", "iqtibos" →
  "iqtiboslar", and the missing "spaced repetition" added ("oraliq takrorlash bilan"). ru: «скажи лучше» (ты form,
  against the glossary) → «Как сказать лучше», "которые вы перезаписываете" → "которые можно перезаписать",
  "с реальным таймингом" → "с таймингом, как на экзамене", + "примерный балл". Lengths 418/500/476 (≤512).
- `manifest.ts:27-28` (language) audience: uz "4.5 dan 8.0 gacha" → "4.5 balldan 8.0 ballgacha"; ru "с уровня 4.5" →
  "с балла 4.5".
- Error tags (language): articles ru "о каком речь" → "о каком идёт речь", "С обобщёнными множественными…" → "Перед
  множественным числом и неисчисляемыми существительными в общем значении…"; uz "Umumiy ma’nodagi ko‘plik…".
  Agreement uz "oradagi ko‘plikdagi ot bo‘lsa ham" → "orada ko‘plikdagi ot turgan bo‘lsa ham"; ru "во множественном"
  → "во множественном числе". Tenses en "Keep one time frame" → "Stick to one time frame"; uz calque "Bitta vaqt
  doirasida qoling" → "Bir zamon doirasidan chiqmang". Prepositions uz "oldingi so‘z bilan birga yodlanadi" →
  "oldidagi so‘zga bog‘liq, shuning uchun ularni birga yodlang". Countables ru name + "существительные".
  Sentence boundaries name: uz "Uzilmagan gaplar va bo‘laklar" (means "uninterrupted sentences") → "Qo‘shilib ketgan
  va chala gaplar"; ru "Слитные предложения и обрывки" → "Слитные и незаконченные предложения". Collocations en
  "a heavy rain" → "heavy rain" (uz/ru already right). Register: en "slang (kids, a lot of stuff)" → "informal words";
  uz "jargon" (wrong term) → "so‘zlashuv so‘zlari", "o‘quvchiga" (reads as "pupil") → "o‘qiyotgan kishiga"; ru "в речи
  можно расслабленнее, но ясно" (ungrammatical) → "устная речь может быть свободнее, но должна оставаться ясной".
  Undeveloped answers uz "1-qismda ikki-uch gap, 3-qismda esa fikrni rivojlantirib, solishtiring" → "…ikki-uch gap
  ayting, 3-qismda esa fikrni rivojlantiring va solishtiring".
- `manifest.ts:170` (consistency) menu ru "Недельный отчёт" → "Еженедельный отчёт" (glossary).
- `manifest.ts:178` (language) /mock description uz "(1–3)" → "(1–3-qismlar)", ru "(1–3)" → "(части 1–3)".

## diagnostic.ts
Counts: language 3 · fact 0 · answer 0 · consistency 4 · honesty 0 · placeholder 0
All 21 keyed answers verified (grammar, vocabulary, both passages). All correct.
### Changes
- `diagnostic.ts:16-18` intro: en "placement check" → "placement test" (glossary); exam parts capitalised in all three
  languages (Speaking, Writing, Listening); uz "darajani aniqlash testi" → "daraja testi" (glossary), "sun’iy
  intellektsiz" → "AI ishtirokisiz" (glossary: AI), "rasmiy IELTS bali" → "balli" (spelling), "ikkita qisqa o‘qish
  matni" → "o‘qish uchun ikkita qisqa matn"; ru "тест на определение уровня" → "тест уровня" (glossary).
- `diagnostic.ts:193` (language) c2 uz "uzoq to‘xtalishlarsiz" ("without dwelling on things") → "uzoq pauzalarsiz".
- `diagnostic.ts:202` (language) c3 ru "например как технологии…" → "например, как технологии…".

## rubrics.ts
Counts: language 0 · fact 16 · answer 0 · consistency 0 · honesty 0 · placeholder 0
Each descriptor compared with the public IELTS Speaking and Writing band descriptors (meaning, not wording).
### Changes (descriptors that overstated or understated a band)
- Speaking FC 5: "a filler every few words" overstated 5 → "frequent fillers, often while searching for fairly basic
  words". FC 3: "Long silences before and inside most answers… rarely get beyond a few words" described band 2 →
  frequent, sometimes long pauses; short simple responses; simple sentences linked with difficulty; basic message
  often not conveyed.
- Speaking LR 5: "gets the basic message across on less familiar ones" is the band 4 wording (understated) →
  "Enough words for familiar and less familiar topics, but with little flexibility".
- Speaking GRA 8: "nearly every sentence is correct" overstated → "the great majority of sentences are correct".
  GRA 6: "cannot yet bend them to the purpose" → "a mix of short and complex sentences and a variety of structures,
  used with limited flexibility".
- Pronunciation 6: "Usually understood… the listener sometimes has to work" understated 6 (public 6: understood
  throughout without much effort; only occasional lack of clarity) → rewritten. Pronunciation 4: "Few features…
  are controlled" is band 2 territory → "Some features are acceptable, but the range is narrow and control…is limited;
  …understanding takes effort, and some stretches cannot be understood at all".
- Writing CC 8: "always clear… no gaps in the linking" overstated (8 allows occasional lapses) → "followed with ease…
  with at most an occasional lapse". CC 5: "the overall direction is unclear" understated → adds "the reader can follow
  how the ideas relate, but the order is not wholly logical"; "Paragraphing may be inadequate or missing".
- Writing LR 4: "may tire the reader" understated → "may strain the reader or obscure the meaning".
- Writing GRA 8: "nearly all sentences are free of error" → "the great majority…, and punctuation is well managed".
- Task Achievement 6: "key features are reported mechanically" is the band 5 wording → "an overview is attempted and
  the key features chosen are adequately highlighted with figures, but some details are irrelevant, inaccurate,
  missing or excessive"; reason line → "the main points need more extension or a clearer overview".
- Task Achievement 5: "a bullet point is missing" (fact) — in the public descriptors a bullet point left out is band 4;
  band 5 has every bullet point presented but one or more covered inadequately → rewritten. TA 4: "bullet points are
  left out" → "not every bullet point is covered".
- Task 1 assessor rule (`task1Notes`): "A missing bullet point limits task_achievement to 5" → "to 4, and one that is only
  touched on usually limits it to 5". No calibration letter has a missing bullet, so references are unaffected.
- Task Response 4: "or from the side" (not English) → "or tangentially"; "The view is unclear" → "A view can be found
  only with careful reading" (public 4: position discernible with effort; no position is 3).

## writing.ts
Counts: language 6 · fact 3 · answer 0 · consistency 1 · honesty 0 · placeholder 0
All Task 1 data checked: pie and bar shares sum to 100; every figure, ratio and crossing point in the assessor notes
matches the data (e.g. EV lines: A leads from 2016, B behind C from 2020; museum Art Gallery ×2.09; metro 2 points
behind bus).
### Changes
- `writing.ts:82` title uz "Sun’iy intellekt ofis ishlarini egallaydimi?" → "AI ofis ishlarining o‘rnini egallaydimi?"
  (glossary AI; "o‘rnini egallamoq" = replace); ru "Заменит ли ИИ офисную работу?" → "…офисных работников?".
- `writing.ts:83` prompt "answer customers" → "answer customers’ questions".
- `writing.ts:90` title uz "Voyaga yetmagan huquqbuzarlar" → "…huquqbuzarlarni jazolash" (en says "Punishing").
- `writing.ts:98` title uz "Dunyo bo‘ylab mahsulotlar" → "Dunyoning turli burchaklaridan mahsulotlar".
- `writing.ts:102` assessor note "All three areas named … do not need equal space" (says none needs space) → "The three
  areas named … do not all need equal space".
- `writing.ts:276,286,296` (fact) letters: "A missing bullet point limits Task Achievement to 5" → 4 (as in rubrics.ts).
- `writing.ts:286` assessor note "people who do not drink" → "dietary needs" (school-age audience).

## speaking.ts
Counts: language 0 · fact 0 · answer 0 · consistency 0 · honesty 0 · placeholder 0
Questions, cue cards, round-off and Part 3 questions are natural, original and in the IELTS format; examiner frames are
paraphrased, not copied; timings (11–14 minutes, 1 minute prep, 1–2 minute talk) are right. No changes.

## samples.ts
Counts: language 7 · fact 5 · answer 1 · consistency 11 · honesty 1 · placeholder 0
Arithmetic: speaking report FC 6, LR 6, GRA 5, pronunciation not scored → mean 5.67 → 5.5 ✓ (3 of 4 criteria scored);
writing report 6+6+5+5 → 5.5 ✓; 1 min 44 s = 104 s ✓; the plan week is 40 minutes every day ✓. Every evidence quote
is in the sample's own `said`/`original` lines ✓. All four samples are labelled as examples with fictional learners ✓.
### Changes
- (answer) writing report correction 5: corrected "On the other hand, parents are also responsible." contradicted its
  own explanation ("here you are adding a point, so 'Parents are also responsible' works better on its own") →
  corrected "Parents are also responsible."; why now also says "(not 'in')" in all three languages.
- (fact) upgrade 1: "only about an hour’s drive from Tashkent" — Chimgan is usually more than an hour by road →
  "less than two hours’ drive from Tashkent"; the explanation also missed the second error ("in mountains" → "in the
  mountains") → added in en/uz/ru.
- (fact) upgrade 2: "Sports and activities ending in -ing take go" overgeneralised → "Many sports and activities…".
- (fact) upgrade 3: "you feel yourself relax" is grammatical English; the note called it a copied pattern as if
  wrong → "sounds translated from Uzbek or Russian; the natural phrase here is simply 'feel relaxed'" (en/uz/ru).
- (fact) weekly report focus ru "сократите слова-паразиты до 4 в минуту" vs en "below 4" → "до менее чем 4 в минуту".
- (honesty/consistency) pronunciation note uz "bu ballni hech qachon taxmin qilmaydi" ("never estimates", while every
  coach band is a "taxminiy" estimate) → "hech qachon tusmol bilan qo‘ymaydi"; ru "не угадывает" → "не ставит наугад".
- (consistency) ru «скажи лучше» → «Как сказать лучше» (preview); FC note uz «um» → "to‘ldiruvchi so‘zlar", ru «um» и
  перезапуски → "слова-паразиты и фразы, начатые заново" (glossary: fillers); weekly title/preview ru "недельный" →
  "еженедельный" ×2, "три фокуса" → "три главные задачи"; uz "Daqiqasiga «um»lar" → "Daqiqasiga to‘ldiruvchi so‘zlar";
  uz "lug‘at kartalari" → "kartochkalari" and 4 × "20 ta karta" → "20 ta kartochka" (glossary: deck = kartochkalar);
  plan preview uz/ru exam parts capitalised; ru Sunday "Недельный отчёт и фокус…" → "Еженедельный отчёт и задачи…".
- (language) writing GRA note "join two full sentences with so, because or a full stop" (a full stop does not join)
  → "link … with so or because, or separate them with a full stop" (en/uz/ru); TR note uz "kim mas’ulligi" → "kim
  mas’ul ekani"; weekly focus uz had no object ("daqiqasiga 4 tadan kamaytiring") → "to‘ldiruvchi so‘zlarni daqiqasiga
  4 tadan kamga tushiring"; plan uz "qayta yozing" (rewrite) → "qayta yozib oling" (re-record); uz "vaqt bilan to‘liq
  insho" → "vaqt belgilab to‘liq insho".

## plan.ts (reminders, milestones, plan copy)
Counts: language 12 · fact 0 · answer 0 · consistency 1 · honesty 1 · placeholder 4
Placeholders are identical across en/uz/ru in every reminder (checked one by one).
### Changes
- (placeholder) English plural broke on real values: `delivery.ts` sends countdowns for `days` 0–21 and streaks start at
  1, so "{days} days to your exam" / "Your streak is at {streak} days" rendered "1 days". → "Days until your exam:
  {days}.", "{name}, days to go: {days}.", "Days until the exam: {days}.", "You are on a {streak}-day streak." (ru and uz
  forms already worked for any number.)
- (honesty) daily[6] "You are working at band {level}" → "at about band {level}"; uz "Hozirgi darajangiz {level}" →
  "Hozir taxminan {level} ball darajasidasiz"; ru "ваш уровень {level}" → "ваш примерный балл — {level}".
- (language) {task} is an activity title ("Task 2 · No exams before fourteen?"), so "Today’s {task} takes…", "I have
  prepared {task} for you" and "Today’s {task} is a gentle restart" read badly → colon forms ("Today: {task}, …",
  "Today I have this ready for you: {task}.", "Today’s task is a gentle restart: {task}, …"); uz the same with «{task}»
  ("Bugungi vazifa — «{task}»"); ru countdown "сегодняшнее «{task}»" → "сегодняшнее задание «{task}»".
- (language) "whenever suits you" → "whenever it suits you"; uz "qulay vaqtingizda" → "o‘zingizga qulay vaqtda
  bajaring"; ru "мин., когда вам удобно" → "мин. — в любое удобное для вас время"; uz countdown calques "yangi
  saqlaydi" (keeps fresh) → "charxlab turadi", "hisobga kiradi" → "o‘z hissasini qo‘shadi", "Hozirgi muntazam mashq …
  yordam beradi" → "Hozir muntazam mashq qilish … qo‘l keladi", "Odatingizni saqlang" → "Mashq tartibingizni saqlang";
  ru "Именно спокойная … помогает" → "Спокойная регулярная практика сейчас — то, что поможет…"; uz comeback "{minutes}
  daqiqa vaqtingiz bo‘lganda, {task} tayyor" → "bo‘lsa, «{task}» tayyor".
- (language) phases uz "Rivojlanish: boy lug‘at va aniqlik" (range ≠ rich vocabulary) → "xilma-xillik va aniqlik";
  "vaqtli mashqlar" → "vaqt belgilangan mashqlar".
- (consistency) weekly ru "недельный отчёт" → "еженедельный отчёт".
- Milestones and link labels: fine, no change.

## index.ts
No learner-facing strings. No change.

## calibration/*.ts (rationale only)
Counts: language 0 · fact 5 · answer 0 · consistency 0 · honesty 0 · placeholder 0
Word counts recomputed from the responses: the stated counts (128 words, "about 190", "under 150", "under 250") are
right; every quoted error in a rationale is in the learner text; data claims checked against the task data.
### Changes
- `calibration/writing_task2.ts:24` rationale said "About 190 words … so Task Response cannot go above 4" — the length
  rule caps at 4 only under ~180 words; the 4 comes from the unclear position and thin ideas → reworded so the reasons
  match the rule; the fragment sentence fixed.
- `calibration/speaking.ts` sp.p2.b4-teacher: "a filler every few words" (16 fillers in 189 words) → "16 fillers, 7 long
  pauses"; "almost every verb is wrong" (about half are) → "many verb forms are wrong".
- sp.p2.b5-samarkand: "articles and negatives keep failing ('… if somebody come …')" → "articles, agreement and
  negatives" (that quote is agreement).
- sp.p3.b7-village-city: the list quotes "leaving from villages" (a preposition error) → "comparatives, word order,
  prepositions and past habits".

## [VERIFY]
- `samples.ts` upgrade 1: drive time Tashkent–Chimgan. Changed "about an hour" to the safe "less than two hours’ drive";
  confirm, or name the time you prefer.
- `manifest.ts:26` audience text says "band 4.5 to 8.0" but `audience.levels` is `[4, 8.5]` and goal options are 5–8.
  `levels` is only validated (not shown), so I left both; decide which is meant.
- Policy change to confirm: a missing GT bullet point now caps Task Achievement at 4 (was 5) in `rubrics.ts` and the
  three letters in `writing.ts`, following the public band 4 ("not all bullet points presented").
- `plan.ts:14` filler list includes `kind of` and `sort of`; the engine will count "this kind of food" (and answers to
  "What kind of food…?") as fillers, inflating fillers/min. Data, not text: not changed.
- Engine (out of scope, `supabase/functions/schood-ai/coach/delivery.ts:89`): `name` can be '' and `level` is '—'
  before placement, so reminders render ", today’s task is ready…" or "about band — and aiming for 6.5". The lead may
  want a fallback name or to skip `{level}` templates when there is no placement.
- Out of scope, same rule as the manifest: `packages/coach-packs/src/copy.ts:135` `speak.better_title` ru «Скажи
  лучше» and `apps/schood-ai/src/coach/i18n/ru.ts:178` `coach.session.better` 'Скажи лучше' should be «Как сказать
  лучше» (glossary).
- `writing.ts:7-8` T1_END/T2_END use the standard IELTS instruction wording word for word. That is the exam's fixed task
  frame, not content, so I kept it; say if you want it paraphrased.
- `diagnostic.ts:3` code comment says "27 auto-scored items"; it is 21 auto-scored + 6 can-do (comment only).

## Glossary proposals
- "Say it better" (feature): en "Say it better", uz "Yaxshiroq ayting", ru «Как сказать лучше». It is used in the bot,
  the Mini App and pack copy, and the ru catalogs disagree today.
- Cue card (Speaking Part 2): en "cue card", uz "mavzu kartochkasi", ru "карточка с темой". "kartochka" alone is
  already the vocabulary deck term.
- Estimated band: uz "taxminiy ball", ru "примерный балл" as the standing form in coach copy ("{level}" reminders,
  taglines).

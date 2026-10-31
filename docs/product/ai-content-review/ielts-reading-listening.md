## IELTS Reading (packages/coach-packs/ielts/reading.ts)
Counts: language 24 · fact 0 · answer 0 · consistency 3 · honesty 0 · placeholder 0

All 8 sets (56 questions) checked item by item against the passages: every key, accepted string,
word limit and `evidence` quote is right (evidence strings are verbatim; TFNG/YNNG False vs Not Given
correctly distinguished; one heading per paragraph, distractors clearly wrong; MCQs have exactly one
defensible option). Passage facts (urban heat island, Hebrew revival, language nests, slow-wave/REM
sleep, Roman/crown/cylinder/float glass, window tax, mangrove adaptations and carbon, Svalbard-style
vault withdrawal, 1950s MT demos, statistical MT on parliament proceedings) are accurate or neutrally
worded. No key changes.

### Changes
- `reading.ts:~97` (language/fact, ru) cooling q4: «быстрее остывает пригород» → «загородная местность»: a suburb is part of the city; the passage contrasts the city with the countryside.
- `reading.ts:~398` (consistency, en) window q5: "include “oiled”: it is the detail that made the cloth useful against rain" → "“cloth” alone is incomplete": the rain claim is not in the passage (outside knowledge in an IELTS explanation); uz/ru now give the same reason.
- `reading.ts:~399, ~359` (language, uz) "yog‘och darchalar"/"darcha" (= small window) for *wooden shutters* → "yog‘och qopqoqlar"/"yog‘och qopqoq".
- `reading.ts:~388` (language, uz) window q4: "eritilgan oyna" → "eritilgan shisha" (oyna = pane/mirror; the material is shisha).
- `reading.ts:~162, ~417, ~548` (language, uz) 3 × detached suffix on an option name: "Yes ni", "True ni", "Yes ga" → "Yes’ni", "True’ni", "Yes’ga" (glossary rule for suffixes on Latin-spelt names).
- `reading.ts:~196` (consistency, uz) "siyosiy qo‘llov" → "siyosiy qo‘llab-quvvatlov" (same term as q3 just above).
- `reading.ts:~212` (language, uz) "yosh so‘zlovchilarni" → "tilda so‘zlashadigan yoshlarni" (so‘zlovchi = the speaker of an utterance, not a language speaker).
- `reading.ts:~268` (language, uz) "XX asrdagi e’tiqod" (religious belief) → "XX asrdagi tasavvur".
- `reading.ts:~269` (language, ru) sleep q1: broken sentence «…описано в следующих предложениях, а не взгляд XX века» → «…; в XX веке считали иначе».
- `reading.ts:~297` (language, uz) "qayta takrorlaydi" (pleonasm) → "takrorlaydi".
- `reading.ts:~308` (language, uz) calque "foyda ko‘rsatgan" → "Ba’zi tadqiqotlarda qisqa kunduzgi uyqu foyda bergan, … hali noaniq".
- `reading.ts:~309` (language, ru) «дал пользу» → «принёс пользу».
- `reading.ts:~368` (language/consistency, uz) "hikoyalar yoki o‘quvchilar haqida" (o‘quvchi = learner) → "hikoyalar yoki savod haqida" (matches ru «грамотности»).
- `reading.ts:~453` (language, ru) mangrove q1: «а не ценность леса» → «ценность древесины» (the trap heading is about timber).
- `reading.ts:~470` (language, uz) "suv va to‘lqinlar" (waves) for *water and tides* → "suv va suv ko‘tarilishi" (the term used two lines earlier).
- `reading.ts:~471` (language, ru) «естественный ток воды» → «естественное течение воды».
- `reading.ts:~558` (language, ru) «чем они позволяют» (incomplete) → «чем позволяют сами данные».
- `reading.ts:~582, ~598` (language, uz) calque "parvarish uyi" for *care home* → "qariyalar uyi" (2 ×).
- `reading.ts:~608` (language, ru) «прогулов» (unexcused truancy) for *absence* → «пропусков работы».
- `reading.ts:~670` (language, ru) «эксплуатирует идею» → «обыгрывает идею».
- `reading.ts:~680` (language, uz) "paketlarga muhrlanadi" (stamped with a seal) → "paketlarga germetik joylanadi".
- `reading.ts:~747` (language, uz) "haddan tashqari ishongan yaratuvchilar" → "o‘ziga ortiqcha ishongan yaratuvchilar" (over-confident = too sure of themselves).
- `reading.ts:~748` (language, ru) «но не надёжно лучше» → «но не стабильно лучше».
- `reading.ts:~197` (language, ru) «у … языка их «редко» бывает» → «они бывают «редко»».

### [VERIFY]
- none.

## IELTS Listening (packages/coach-packs/ielts/listening.ts)
Counts: language 13 · fact 1 · answer 0 · consistency 3 · honesty 0 · placeholder 0

All 6 sets (36 questions) checked against the scripts: every key and accepted string is right,
within the word limit and present in the script; names that form items ask for are spelled letter
by letter (M-I-R-Z-O, K-A-R-I-M-O-V-A); every corrected figure (12th → 10th, £12 → £15, £45 → £38,
£90 → £70, 1st → 8th) resolves to the keyed value; matching lists have one right option per item.
Note: the matcher drops a leading article, so "a week" also accepts "week" (harmless). Lecture facts
(sun compass with clock-shift, star-rotation learning, inclination compass, olfactory homing in
seabirds, sunset recalibration in songbirds; yakhchals with heat-resistant mortar, sawdust-packed
ice trade, ammonia refrigerants, refrigerated ships) are accurate. No key changes.

### Changes
- `listening.ts:40–610` (fact/consistency) 6 set titles "Section 1/2/4: …" → "Part 1/2/4: …", uz "N-bo‘lim" → "N-qism", and "In Section 1" / "1-bo‘limda" in q1's explanation → "In Part 1" / "1-qismda". The IELTS Listening test now names its four parts "Part 1–4", and the pack already uses "Part N" / "N-qism" for Speaking; ru «Часть N» was already right. (Ids, tags and code comments unchanged.)
- `listening.ts:161` (language, uz) "oila bilan yashashni kelishish" (living with *a* family, vague) → "mezbon oilada yashashni kelishish" (homestay).
- `listening.ts:~120, ~133` (language, uz) calque "rezident narxi" for *resident rate* → "tuman aholisi narxi" (2 ×).
- `listening.ts:~146` (language, uz) redundant "xodim nega so‘rayotganining sababi" → "xodim bu savolni berishining sababi".
- `listening.ts:~228` (language, uz) "gavjum va qiziqarlisi Old Town" (gavjum = crowded) → "jonli hudud esa Old Town" (lively).
- `listening.ts:~229` (consistency, ru) «Хиллтоп» transliterated while Riverside/Old Town stay in Latin → «Hilltop» (the learner hears and reads the English name).
- `listening.ts:~311–325` (language, ru/uz) *ear protection*: «Наушники» (headphones) → «Защитные наушники»; "Quloqchinlar" → "Himoya quloqchinlari" (2 × each).
- `listening.ts:~337` (language, uz) Russianism "«metallomga sotilgan»" → "«temir-tersak sifatida sotilgan»".
- `listening.ts:~363` (language, uz) "ular biroz bor ham" → "ulardan ozgina bor ham".
- `listening.ts:~431` (language, uz) stray comma before "va" and a broken participial phrase → "Ground floor — «ijtimoiy qavat» va «…». Keyinroq aytilgan maslahat (yordam stoli o‘rniga fan kutubxonachisiga yozilish) stolning joyini o‘zgartirmaydi."
- `listening.ts:~564` (language, uz) "Magnit chiziqlarining" → "Magnit maydoni chiziqlarining" (field lines).
- `listening.ts:~576` (fact, en) "Seabirds without a sense of smell" → "Seabirds whose sense of smell was temporarily blocked" (the script says temporarily blocked; uz/ru already said so).
- `listening.ts:~650` (language, uz) "qipiqqa o‘ralgan … u o‘ralgan material emas" (wrapped) → "qipiqqa joylangan … u joylangan material emas" (packed in).
- `listening.ts:~651` (language, ru) «утеплителем» (building insulation) → «теплоизолятором» (insulator).

### [VERIFY]
- `listening.ts:~146` (uz) "markazni unga opasi tavsiya qilgan": the script says only "my sister"; "opa" makes her older. Uzbek has no neutral singular; left as is (harmless), flag only if the owner prefers "singlisi" or "opa-singli".

### Glossary proposals
- Exam parts: add the uz form "N-qism" (1-qism, 2-qism…) and ru «часть N» for Speaking AND Listening parts, and note that IELTS Listening has Part 1–4 (not "Section"). Today the table only says "Part 1–3 | same | same", which the pack does not follow in uz/ru.
- Answer options as words: suffix on an English option name with ’ ("True’ni", "Yes’ga", "Not Given’ni"), never a detached "True ni".

## Checks run (worktree root)
- `deno run --no-lock --allow-read packages/coach-packs/scripts/check.ts ielts` → ✓ 55 activities, no problems.
- `deno run --no-lock --allow-read packages/coach-packs/scripts/calibration.ts ielts` → ✓ all 3 rubrics.
- `deno test --no-lock packages/coach-packs/test/` → 22 passed, 0 failed.
- `deno test --no-lock supabase/functions/schood-ai/coach/` → 32 passed, 0 failed.

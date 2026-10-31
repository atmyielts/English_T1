## B6 Public Speaking: drills (packages/coach-packs/speech/drills.ts)
Counts: language 58 · fact 9 · answer 1 · consistency 30 · honesty 6 · placeholder 0

Edits were scripted with exact-match replacements (each old string matched exactly once):
(edit script kept outside the repo).

### Changes
- (consistency, glossary) Filler words. Bare uz "to‘ldiruvchi" (which in Uzbek grammar also means
  the syntactic *object*) → "to‘ldiruvchi so‘z/so‘zlar" everywhere in the fillers drill (title, explain,
  f1–f8: ~16 places). Bare ru "паразит(ы)" → "слово-паразит / слова-паразиты" (~14 places); this also
  fixes case errors such as «считать паразиты», «времени на паразиты», «на каждый паразит»
  (animate accusative) → «считать слова-паразиты», «на каждое слово-паразит».
- `drills.ts:15` (language/fact) fillers explain: "A filler is a sound you make…" → "a sound or word that
  fills the time while your brain looks for what to say next" (fillers are also words: like, типа,
  haligi); ru «Молчаливая пауза… вдохните и говорите» → «Пауза в тишине… вдохните и продолжайте».
- `f8` (fact/consistency) the English prompt quoted Russian/Uzbek fillers (`"типа" / "haligi"`) →
  `"like"`; each language now names its own filler.
- `f6` (language) en option `"Ee" between every sentence` → `"Um" before every sentence` ("ee" is not an
  English filler); ru «между каждой фразой» → «перед каждой фразой».
- `f1, f3, pa1, a5, apology explain, examples explain` (honesty: unsourced generalisations softened)
  "a one-second silence is invisible" → "an audience hardly notices…"; "Most people have one or two habit
  fillers" → "Many speakers lean on…"; "Above about 170 wpm people start to miss words" → "many
  listeners"; "Most of your nerves are invisible" → "The audience sees far less of your nerves than you
  feel"; "the audience rarely notices shaking" → "often does not even notice"; "People remember stories…,
  not general claims" → "far better than general claims". Same in uz/ru.
- `pl2` (answer) Prompt "'One in five students' is clearer than…" had two defensible answers: "several
  students" is also less clear than "one in five". Now: "Which phrase means the same as 'one in five
  students' but is harder to picture?" (uz/ru likewise); key 0 (20 percent of the student population)
  is now the only right answer. Options and order unchanged.
- `c1` (fact) explanation said the close gives "time and place"; the line gives a day and a time →
  "with a day and a time" (uz «Kun va vaqt», ru «с днём и временем»). ru option «одно утро — один чистый
  канал» (en "one cleaner canal") → «одно утро — и канал станет чище».
- `drill.voice explain` (fact) "rise on questions" is wrong for wh-questions in all three languages
  (they fall) → "let your voice rise on a yes/no question"; uz ««ha/yo‘q» savolida ohangni ko‘tarish», ru
  «подъём тона в вопросе «да или нет»». ru «ударение на одно ключевое слово» (ударение = word stress) →
  «выделение голосом одного ключевого слова»; uz adds «(mantiqiy urg‘u)». uz «faqat ovozdan» (voice only
  from voice) → «faqat tovush orqali».
- `a1` (fact, mixed pack) uz/ru distractor "Sorry, my English is not perfect" made no sense in an Uzbek
  or Russian talk → «Kechirasiz, slaydlarim unchalik yaxshi chiqmadi.» / «Извините, слайды получились так
  себе.» (still an apology; en unchanged). ru «полкласса провалили» → «провалило» (agreement).
- `a4` (fact) uz «Tez gapirishga harakat qilaman» (I'll try to speak fast) for "I will try to be quick"
  → «Qisqa gapirishga…»; uz explanation now includes "not by apologising for being there".
- `a6, a8, c8` (language, glossary rule: neutral gender in learner lines) «Вот что я обнаружил, когда
  проверил сам» → «Вот что показала моя собственная проверка»; «Я проверял это три месяца» → «Я уже три
  месяца это проверяю»; «Я здесь лучший оратор» → «Лучше меня здесь никто не выступает»; «Кажется, я
  сказал всё» → «Кажется, это всё».
- `v6, e8` (language) uz prompts "…bo‘lishi kerak…" + options starting "…" cannot chain in Uzbek
  (verb-last) → full questions with complete options; ru v6 «Заметки… должны быть… несколько ключевых
  слов» (ungrammatical) → «Что должно быть в заметках к выступлению?» with full options.
- `pz5, pz7, pz8, pz2` (language) ru «НЕполезная длинная пауза» → «Длинная пауза, которая НЕ помогает,
  — это…»; en "Let it sit" → "Let it land"; uz «xonaga qarang» (look at the room = the walls) → «zalga
  qarang»; ru «Кто это чувствовал?» → «Кому знакомо это чувство?», uz «Bu tuyg‘u kimga tanish?».
- `pz4, r2, drill.signposts title` (consistency) uz "ishora" for *signpost* (glossary: "ishora" is a
  maths sign) → «o‘tish iborasi»; title → «Tinglovchini ushlab turadigan o‘tish iboralari».
- Russian grammar/naturalness, one each: r1 «о трёх вещах: проблема, план…» → «о проблеме, о плане и о
  том, что нам нужно»; r4 «Вот проблема. Так что мы можем…» → «Вот в чём проблема. Что же мы можем…»;
  f5 «говорить что придёт в голову» → «говорить всё, что придёт в голову»; pl7 «открыть библиотеку по
  субботам» → «открывать» (aspect); c6 «Можем встретиться… — покажу первые результаты?» → «Сможем
  встретиться… на полчаса? Я покажу первые результаты.»; c7 «Должны ли последние слова быть…» →
  «Стоит ли заканчивать словами…»; close explain «Отрепетируйте…, чтобы сказать» → «Репетируйте…, пока не
  сможете сказать» (= en "until"); v4 «вариативность голоса» (calque) → «выразительность голоса»; pl1
  «домашку» → «домашние задания»; e2 «Очередь… стояла до двери» → «тянулась до самой улицы»; qa5, qa6,
  qa3, qa4, v6, v8, pz3, pz6, f2, f3, pa6, h2, pl6 small wording fixes.
- `drill.examples explain` (fact) ru «или точную цифру» (precise) ≠ en "a number you know is true" → «или
  цифру, в которой вы уверены»; uz «aniq bilgan raqam» → «to‘g‘riligini aniq bilgan raqamingiz».
- Uzbek naturalness, one each: h3 «butun xonani yo‘qotishi mumkin» (calque of "lose the room") → «butun
  zalning ishonchini yo‘qotishi mumkin»; pa8 «shoshilinch fikr» (urgent) → «shoshib aytilgan fikr»; pl3
  «hammani siz bilan olib qoladi» → «hech kimni ortda qoldirmaydi»; pl8 «o‘zlashma so‘zlar — atama»
  (term) → «tushunarsiz jargon»; qa3 «Siz noto‘g‘risiz» → «Siz adashyapsiz»; qa8, v3, qa4 «xona…» → «zal»
  / «tinglovchilar»; c2, c3, c4, c7, f7, pl6 («sinovi» = mock in the glossary → «tekshiruvi»), qa1, qa2,
  qa5, r5, r8, a5, v1, v8, e1 («"3"» → «3»), e2, e6, pz6, pz8, drill.qa explain («Dushmanona» →
  «Hujumkor»; "say so" made explicit).

### [VERIFY]
- `drills.ts:25–26` (and pack-wide: `manifest.ts:88`, `lessons.ts:82`, `rubrics.ts:58`, `plan.ts:17`):
  the comfortable pace "110–170 words a minute" and "above about 170" are given for uz and ru too.
  Russian and especially Uzbek (agglutinative, long words) carry more syllables per word, so the same
  speaking speed gives fewer words per minute; an Uzbek speaker at a normal tempo may read as "slow".
  I left the numbers (they are shared with the rubric and the plan thresholds); please confirm whether
  the engine should use per-language WPM bands.
- `manifest.ts:113–115` (not my file): the `monotone` tag explain still says "rise for a question" /
  «savolda ohangni ko‘taring» / «повышайте тон в вопросе». I narrowed the drill to yes/no questions; the
  manifest owner may want the same wording.

## B6 Public Speaking: shadowing (packages/coach-packs/speech/shadowing.ts)
Counts: language 12 · fact 9 · answer 0 · consistency 3 · honesty 0 · placeholder 0

Script: (edit script kept outside the repo) (23 exact-match replacements).

### Changes
- `shadowing.ts:14` PAUSE (fact, per-language) "Pause for one second at the comma" did not fit the
  lines that use it: the uz versions of p01/p02/p04 have no comma (Uzbek puts none before "va"), the
  ru versions have grammatical commas where no pause belongs («Спасибо, | что пришли»), en p01's only
  comma is the vocative "Good morning, everyone", and s03/s08 have no comma in en at all. Now: "Pause
  for one second between the two halves of the line…" / «Gapning ikki qismi orasida…» / «…между двумя
  частями фразы…» — true for all remaining PAUSE lines in all three languages.
- `shadowing.ts:16` QUESTION (fact) "Let your voice rise on the question" is wrong for o01 ("How many of
  you…?", «Кто из вас…?», «Qaysi biringiz…?»: wh-questions fall in English, Russian ИК-2 and Uzbek). Now:
  stress the question word, look at the room, wait two seconds. o05 ("What if the problem is not money,
  but time?", uz "-chi" question with no question word) got its own note: stress "money"/"time" (uz
  «Pulda»/«vaqtda», ru «в деньгах»/«во времени»), the contrast is the hook.
- `s03` (fact) PAUSE note on a line with no comma in any language → 'Stress "second", then pause after
  the line' (uz «Ikkinchi», ru «второму»). `s08` (fact) same problem → "Slow down at the end of the line,
  then pause before you show the example"; uz «ko‘rsataman» after «Keling» → «ko‘rsatib beray»; ru
  «Давайте покажу» → «Давайте я покажу».
- `p07` (fact) uz note said pause after «eng ko‘p», which in the Uzbek line sits mid-sentence → «Gap
  oxirida, raqamni aytishdan oldin, ikki soniya to‘xtang.»
- `c04` (fact) uz note "stress the last word" fell on «degani», ru «ударение на последнем слове» fell on
  the particle «ли». uz line «Savol qila olamizmi, degani emas. Qilamizmi, degani.» (unnatural) → «Masala
  qila olishimizda emas. Masala — qilishimizda.», note stresses «qilishimizda»; ru note → «выделите голосом
  «сделаем»».
- Gendered ru lines the learner repeats (glossary rule) → neutral: p05 «я буду краток» → «буду говорить
  коротко»; o03 «я не мог сказать ни слова» → «у меня не получалось сказать… ни слова»; c07 «Буду рад
  вашим вопросам» → «С удовольствием отвечу на ваши вопросы».
- (language) uz o07 «Hech qachon… kechikkan bo‘lsangiz» ("never") for "ever" → «Qachondir… kech qolgan
  bo‘lsangiz»; uz c05 «ko‘rishguncha» ("until we meet") → «ko‘rishamiz»; uz s09 «qayg‘uradigan» (worry)
  for "care about" → «men uchun eng muhim bo‘lgan qism»; uz o02, o06, p03, s04, c02 wording; ru o06
  «проехала больше, чем многие» → «проделала путь длиннее, чем большинство из нас проделает за всю
  жизнь»; ru c08 tense («годом, когда библиотека ожила») → «чтобы в этом году наша библиотека снова
  ожила»; ru c02, s04 wording.
- (consistency) set titles: uz «To‘ldiruvchi so‘zlar o‘rniga pauza», ru «Паузы вместо слов-паразитов»;
  uz signposts «Yo‘nalish beruvchi o‘tishlar» → «Bog‘lovchi iboralar va o‘tishlar».

### [VERIFY]
- none.

## B6 Public Speaking: speaking parts (packages/coach-packs/speech/speaking.ts: pitch, impromptu, story, rehearsal, Q&A)
Counts: language 30 · fact 6 · answer 0 · consistency 4 · honesty 1 · placeholder 0

Script: (edit script kept outside the repo) (45 exact-match replacements).
Timers checked against the text: pitch (20/50/90 s) "thirty seconds", "one minute", "forty-five
seconds", "under a minute" all fit; impromptu (30/75/120 s) "about a minute" fits; rehearsal cards
(prep 90 s, talk 180 s, min 90 s) match "ninety seconds… up to three minutes"; Q&A (15/40/75 s) fits.

### Changes
- `speaking.ts:149` story.person (fact, timer) "Now tell the same story in thirty seconds" is below the
  story part's `answerSeconds.min` of 45 s (passed to the assessor as `expected_seconds`), so a correct
  answer would read as too short → "in about a minute" (uz «taxminan bir daqiqada», ru «примерно за
  минуту»).
- `card.survey` (honesty, glossary "Practice figures") ru «примерные цифры» means *approximate*, not
  example figures → «Используйте учебные цифры и скажите об этом»; en → "Use figures invented for
  practice and say so"; uz «Mashq uchun raqamlardan foydalaning va buni aytib o‘ting».
- `card.club` discussion (fact) uz «Nega mavjud to‘garakka qo‘shilmaslik kerak?» ("why should one NOT
  join an existing club?") reversed the en/ru question → «Nega buning o‘rniga mavjud to‘garakka
  qo‘shilmaysiz?»; uz «Biror narsa noto‘g‘ri ketsa» (calque) → «Biror muammo chiqsa, kim javobgar
  bo‘ladi?».
- `story.off-plan` (language) en title "A day off plan" reads as "a day off" → "A day that went off
  plan"; uz «Rejadan chiqqan kun» → «Reja buzilgan kun».
- `imp.skill-18`, `imp.third-language` (consistency) en "a younger cousin" vs uz/ru "younger brother
  or sister" → en "a younger brother or sister"; uz «kichik ukangiz» (uka is already younger) → «ukangiz».
- `pitch.new-team` (language) "what will you bring to this team" calqued as «nima olib kelasiz» /
  «что вы принесёте команде» → «qanday foyda keltirasiz» / «чем вы будете полезны команде».
- `pitch.club` (fact) uz «talabalarga», ru «студентам» for school *or* university students → uz
  «tengdoshlaringizga», ru «ребятам»; ru «Представьте ей его за минуту» → «За минуту расскажите ей о
  клубе».
- Russian grammar/naturalness: «счастливее или одинокее» → «или более одинокими»; «пользоваться соцсетями
  здоровее» → «без вреда для себя»; «что бы изменили первым» → «что бы вы изменили в первую очередь»;
  «какое направление хотите» → «на какое направление хотите поступить»; «Представьте проект…, и чему вы
  научились» (zeugma) → «Расскажите о проекте… и о том, чему вы научились»; «маленькой доброте» → «небольшом
  добром поступке»; «Начал ли кто-то из-за вас?» (no object, negative «из-за») → «Кто-нибудь начал так делать
  благодаря вам?»; «Кто вдохновил этот план?» → «Кто вдохновил вас на этот план?»; Q&A intro word order;
  plus «небольшую поддержку» → «спонсорскую помощь», «или другое» → «или другой навык», «школу или работу» →
  «место работы», «три человека» → «трое», card.city, card.book, card.habit, card.project wording.
- Uzbek grammar/naturalness: rehearsal intro had no predicate for the prep time («…rejalashtirish uchun
  to‘qson soniya, keyin…») → «…uchun sizda to‘qson soniya bor, keyin…»; Q&A intro «auditoriyada savollar
  bor… va qisqa bo‘lsin» → «tinglovchilarning savollari bor… va qisqa gapiring»; story intro «voqea
  o‘zgargan lahzaga olib keling» → «bizni hamma narsa o‘zgargan lahzaga olib boring»; story.nervous,
  story.off-plan, story.first-day (both questions), imp.part-time, imp.talent («mehnatmi»), card.place
  word order, card.career («hozir qayerdasiz» → «hozir qaysi bosqichdasiz»; «rejani kim ilhomlantirdi» →
  «rejaga sizni kim ilhomlantirdi»), card.city, card.book, card.habit, pitch.startup.

### [VERIFY]
- none in this file.

### Glossary proposals
- **Elevator pitch**: the pack keeps "Elevator pitch" untranslated in uz/ru (part title, manifest node,
  descriptions) and "Pitch"/«Питч» in commands. Propose adding it to the product-terms table as
  en "elevator pitch" · uz "elevator pitch" · ru "elevator pitch (питч)" so all packs agree.
- **Signpost**: uz "o‘tish iborasi" (not "ishora", which the glossary notes means a sign in maths) · ru
  "связка" · en "signpost". Used in the speech drills and shadowing.
- **Filler words, Uzbek**: state in the glossary that the short form "to‘ldiruvchi" alone should not be
  used, because in Uzbek grammar "to‘ldiruvchi" is the *object*; always "to‘ldiruvchi so‘z(lar)". Several
  other speech files (lessons, plan, rubrics, manifest) still use the bare form; owners may want to align.
- **Sentence stress**: uz "mantiqiy urg‘u" / ru "логическое ударение" or «выделить голосом» rather than
  bare "urg‘u"/«ударение» (which mean word stress).

## Checks run (from the worktree root)
- `deno run --no-lock --allow-read packages/coach-packs/scripts/check.ts speech` → ✓ (42 activities).
- `deno run --no-lock --allow-read packages/coach-packs/scripts/calibration.ts speech` → ✓ (all runs agree).
- `deno test --no-lock packages/coach-packs/test/` → 22 passed, 0 failed.
- `deno test --no-lock --allow-all supabase/functions/schood-ai/coach/` (includes e2e-speech) → 32 passed, 0 failed.

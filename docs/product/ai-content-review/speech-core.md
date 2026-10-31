# B6 Public Speaking (speech) core review

## Manifest (`speech/manifest.ts`)
Counts: language 15 · fact 1 · answer 0 · consistency 5 · honesty 1 · placeholder 0
### Changes
- `manifest.ts:35` (consistency) uz tagline left out the structure score the en/ru taglines promise → "…sur’at, to‘ldiruvchi so‘zlar, pauzalar tahlili va tuzilma bahosi." (118 chars).
- `manifest.ts:40` (language) uz description: list had no head noun or verb agreement ("daqiqadagi so‘zlar, … sur’at bahosini olasiz") → "Ovozli xabar yuboring va daqiqadagi so‘zlar soni, … hamda sur’at bahosini oling"; "sizning so‘zlaringiz iqtibosi bilan" → "so‘zlaringizdan iqtiboslar bilan"; "Haftalik natija va eslatmalar" → "Haftalik natijalar, yangi darajalar va eslatmalar" (en has level-ups).
- `manifest.ts:41` (language/consistency) ru description: "Отправьте голосовое: слова в минуту…" had no verb and nominative "оценка" → "Отправьте голосовое сообщение и получите: … и оценку темпа"; Latin «ee» in Russian text → «э-э»; "Тренировки:" → "Упражнения:" (glossary: drill = упражнение).
- `manifest.ts:49-50` (language) uz "ishonchli notiqlikkacha" (to confident oratory) → "ishonchli notiqqacha" (to a confident speaker, parallel to en); ru "от первой волнительной речи" (colloquial "волнительный") → "от первого робкого выступления".
- `manifest.ts:62` (consistency) ru skill "Темп, паузы и паразиты" → "…и слова-паразиты" (glossary term).
- `manifest.ts:88-90` (fact/honesty) too_fast: "Above about 170 wpm most listeners stop following" stated as fact → "many listeners start to fall behind" (uz "ko‘p tinglovchilar ulgurmay qoladi", ru "Если говорить быстрее примерно 170 слов в минуту, многие слушатели начинают не успевать" — the old ru sentence was also ungrammatical).
- `manifest.ts:94-95` (language) uz no_pauses "auditoriyaga savoldan keyin" → "savol bergandan keyin"; "to‘ldiruvchi so‘z esa yo‘q" (reads as "and the filler: none") → "esa — aksincha"; ru "паразит — нет" → "слово-паразит — нет".
- `manifest.ts:104` (language) uz «Kechirasiz, shekilli tamom» → «Kechirasiz, shekilli, hammasi shu».
- `manifest.ts:107` (language/consistency) rambling names: uz "Yo‘nalishsiz chalg‘ish" ("aimless distraction") → "Rejasiz, chalkash nutq"; ru "Речь без опор" → "Сбивчивая речь без связок" (связки = signposts, as in the skill name).
- `manifest.ts:112-114` (language/consistency) ru "ровный голос" → "монотонный голос"; uz "Takrorlash mashqi bilan ishlang" → "Shadowing (takrorlash mashqi) bilan ishlang" (glossary).
- `manifest.ts:119-120` (language/consistency) jargon: uz "siz uni yo‘qotdingiz" (calque) → "siz uning e’tiborini yo‘qotgansiz", and "about" was missing ("yigirma so‘zdan" → "taxminan yigirma so‘zdan"); ru "держите устные предложения короче примерно двадцати слов" → "говорите фразами не длиннее примерно двадцати слов".
- `manifest.ts:124` (language) uz apologising: "degan gap odamlarga tinglamang, deydi" → "odamlarga «meni tinglamang» deganday eshitiladi".
- `manifest.ts:135` (consistency/honesty) ru no_example "точная цифра" → "цифра, в которой вы уверены" (en: "a number you know is true").
- `manifest.ts:141` (language) ru menu label "Показательное выступление" (25 chars, too long for a button) → "Полное выступление" (matches the /mock command text).
- `manifest.ts:145` (consistency) uz "Mini dars" → "Mini-dars" (glossary hyphenates: mini-sinov).
- `manifest.ts:161` (language) /report: ru "Эта неделя против прошлой" (calque of "vs") → "Сравнение с прошлой неделей"; uz "Bu hafta va o‘tgan hafta" → "O‘tgan hafta bilan taqqoslash".
- Lengths after edits: name ≤ 26, tagline ≤ 118, description ≤ ~400 characters in every language.

## Lessons (`speech/lessons.ts`)
Counts: language 30 · fact 6 · answer 1 · consistency 4 · honesty 2 · placeholder 0
### Changes
- `lessons.ts:16-18` (fact) hooks: "People decide in the first ten seconds" and "four openings almost always work" (unsourced claims) → "Listeners decide very early whether to keep listening. Four openings work well" in all three languages.
- `lessons.ts:27-29` (fact/language) rule of three: "Three is the number the ear remembers best… four is too many to hold" (overclaim) → "Three is easy for listeners to remember and feels complete… Two can feel unfinished, and four is harder to hold"; "three words in a final line" did not match the 6-word example → "three short phrases"; uz "sanaganda uchta sanang" → "biror narsani sanab o‘tsangiz, uchtasini ayting"; ru "Два — кажется" (stray dash) fixed; ru option "это ощущается законченным" → "речь звучит законченно".
- `lessons.ts:37-46` (answer/consistency) uz signposts were called "ishora", which in Uzbek also means a gesture; the check "Ishora nima?" had the distractor "Qo‘l harakati" (a hand gesture), so uz learners had two defensible answers. → "o‘tish iborasi / o‘tish iboralari" throughout the lesson (matches the skill name "o‘tishlar" and samples/shadowing "Yo‘nalish beruvchi o‘tishlar"). Also uz «Bu meni … ga olib keladi» (calque) → «Endi …ga o‘tamiz»; "bir qatorli xulosa" → "bir gaplik xulosa"; ru «Это подводит меня к…» → «…нас к…».
- `lessons.ts:49-51` (fact) closes: "The last thing you say is what people remember" → "is often what people remember" (uz "ko‘pincha", ru "чаще всего и запоминается").
- `lessons.ts:54-55` (language) ru options: "Это всё, что я хотел сказать" (gendered) → "На этом у меня всё."; "Запишитесь у стола возле двери, прежде чем уйти сегодня" → "Сегодня перед уходом запишитесь у стола возле двери."
- `lessons.ts:61-68` (language) uz pausing "Xonaga savoldan keyin" → "Xonadagilarga savol bergandan keyin"; "(/) belgisi bilan" → "qiya chiziq (/) bilan"; ru explanation "заставляет её услышать" → "заставляет людей её услышать".
- `lessons.ts:70` (honesty) title "Fewer fillers in two weeks" promised a result on a timeline → "Fewer fillers, day by day" / "Kundan kunga kamroq to‘ldiruvchi" / "Меньше слов-паразитов день за днём".
- `lessons.ts:73-78` (language/consistency) ru "используют паразиты", "заменить паразит", "Другим паразитом" → "слова-паразиты", "слово-паразит", "словом-паразитом" (glossary); "Проблема — когда…" → "Проблемой они становятся, когда…"; "смотрите в отчёте коуча паразиты на 100 слов" → "…сколько паразитов приходится на 100 слов".
- `lessons.ts:82-90` (fact/language) pace: "Nerves make most people speak faster" → "many people"; uz/ru "cut a point" was "qisqartiring/сократите тезис" (shorten) → "bir fikrni olib tashlang" / "уберите один тезис"; explanation "Cut content, never the pace or the close" (unclear: you cannot cut a pace) → "Cut content; do not rush, and never drop the close." in all three.
- `lessons.ts:94-95` (language) story arc: uz "odamlar ko‘ra oladigan tafsilot bering" → "ko‘z oldiga keltira oladigan tafsilot qo‘shing"; ru "дайте одну видимую деталь" → "добавьте одну деталь, которую можно увидеть"; "чему это научило" → "чему это вас научило — … с вашей главной мыслью".
- `lessons.ts:105` (language) uz elevator: "Elevator pitch taxminan qirq besh soniya." (no verb) → "…davom etadi."; "tinglovchi taniydigan og‘riq" (calque of "pain") → "tinglovchiga tanish qiyinchilik".
- `lessons.ts:116-119` (language) uz "PREP dan", "PREP dagi" → "PREPdan", "PREPdagi" (glossary: suffix attached, as in IELTSga); ru "Возьмите секунду тишины" (calque) → "Перед началом помолчите секунду".
- `lessons.ts:127-134` (language) Q&A: uz "tinglang, to‘xtang, … to‘xtang" (pause and stop were the same word) → "pauza qiling … va to‘xtang"; uz "adolatli tomonini ayting" → "undagi asosli jihatni tan oling", same in the check option; uz prompt "Avval nima qilinadi?" → "Avval nima qilasiz?"; ru quote with no verb → "Не знаете — скажите: «Пока не знаю, проверю и пришлю»"; "признайте справедливое" → "признайте то, что в нём справедливо"; "Завершите вопросы" → "Завершите ответы на вопросы".
- `lessons.ts:137-145` (honesty/fact) nerves: "After three talks the fear drops a lot" (invented outcome) → "With regular practice the fear usually gets smaller" (uz/ru same); explanation "A long breath out slows the heart" → "helps slow your heartbeat"; uz "ikkita iliq yuzni toping va ularga gapiring" → "ikkita xayrixoh chehrani toping va ularga qarab gapiring"; ru "говорите им" → "обращайтесь к ним"; ru example "полкласса провалили" → "провалило"; uz example "bitta testdan yiqildi" ("one test") → "bir xil testdan o‘ta olmadi" ("the same test").
- `lessons.ts:147-156` (language) en title "Slides that help, not read" (ungrammatical) → "Slides that help, not slides to read"; ru "а не ваши шпаргалки" → "а не шпаргалка для вас", "заметки держите в ключевых словах" → "пишите ключевыми словами, а не целыми фразами"; uz/ru explanations rewritten ("ko‘zlarni sizda va xabarni aniq saqlaydi" → "…bo‘lsa, tinglovchilar sizga qaraydi va xabar aniq qoladi"; "держит взгляд на вас, а мысль — ясной" → "и зал смотрит на вас, а главное остаётся ясным").
- `lessons.ts:160-167` (language) persuade: uz "auditoriyaga nega zarar" → "qanday zarar yetkazadi"; ru "субботние утра" ×2 → "субботнее утро"; ru proof option "просроченных домашних стало три" → "несданных вовремя домашних заданий стало три вместо двенадцати"; uz explanation rewritten ("«Oldin» va «keyin»ni ko‘rsatgan haqiqiy sinov mavhum obro‘ga tayanishdan kuchliroq").
- All 14 check questions re-verified: one defensible answer each, keys and explanations agree in en/uz/ru.

## Plan, reminders, milestones (`speech/plan.ts`)
Counts: language 4 · fact 0 · answer 0 · consistency 3 · honesty 1 · placeholder 5
### Changes
- `plan.ts:52,57,72,94` (placeholder) ru «{minutes} минут» / «({minutes} мин)» → «{minutes} мин.» (glossary) in daily ×3 and comeback ×1; daily[1] reordered to "Сегодня: {task} ({minutes} мин.)."
- `plan.ts:82` (placeholder/language) ru "У {coach} готова тема" put the coach name in a genitive slot it cannot fill ("У Коуч публичных выступлений…") → "{coach} предлагает тему на сегодня: {task}."
- `plan.ts:62` (consistency) ru "посчитает паразиты" → "посчитает слова-паразиты".
- `plan.ts:87-89` (honesty) comeback "A one-minute talk today keeps your progress" implied the progress is lost otherwise → "A one-minute talk is an easy way back: {task}." (uz "Bir daqiqalik nutq bilan osongina qayting", ru "Вернуться легко — минутная речь: {task}.").
- `plan.ts:98-100` (language/consistency) weekly: uz "Nutq haftangiz tayyor" and ru "Ваша неделя выступлений готова" (calques) → "Nutq bo‘yicha haftalik hisobotingiz tayyor" / "Ваш еженедельный отчёт о выступлениях готов" (glossary: haftalik hisobot, еженедельный отчёт); "before and after" → "Compare … with last week" in all three; ru "паразиты" → "слова-паразиты".
- `plan.ts:106,111` (language) ru countdown "До вашего выступления дней: {days}, {name}." → "{name}, до вашего выступления осталось дней: {days}." (same for the second one).
- Placeholders re-checked: every reminder has the same set in en/uz/ru.

## Rubrics (`speech/rubrics.ts`)
Counts: language 3 · fact 0 · answer 0 · consistency 1 · honesty 1 · placeholder 0
### Changes
- `rubrics.ts:54` (consistency) ru flow name "Темп, паузы и паразиты" → "…слова-паразиты" (same as the skill node).
- `rubrics.ts:58` (honesty) flow focus "against a comfortable 110–170" → "against a rough comfortable range of 110–170 (a guide, not a hard rule)". Bands checked: >190 wpm (1), ≥180 or <90 (2), comfortable 110–170, fillers >12 / 7–12 / 3–7 / <3 per 100 words: consistent with `fluency.pace` and the lessons.
- `rubrics.ts:154` (language) ru "Аргументы и факты" (the name of a well-known newspaper) → "Доводы и доказательства".
- `rubrics.ts:169` (language) "bridging": uz "bog‘lash" and ru "переход" did not say "back to your message" → "Xotirjamlik va mavzuga qaytish" / "Самообладание и возврат к теме".
- `rubrics.ts:194` (language) respect descriptor 5 had no verb ("…and the right register for each person") → "…and finds the right register…".

## Placement (`speech/diagnostic.ts`)
Counts: language 10 · fact 0 · answer 0 · consistency 1 · honesty 0 · placeholder 0
### Changes
- `diagnostic.ts:17-18` (language) uz intro "Hiyla savollar yo‘q … Keyin darajangiz va reja." → "Chalg‘ituvchi savollar yo‘q … Keyin darajangiz va rejangizni ko‘rasiz."; ru "о ситуациях выступления" → "о ситуациях на выступлении".
- `diagnostic.ts:24` ru "сказать короткую речь" → "произнести короткую речь".
- `diagnostic.ts:25-36` uz: "qanday boshlash eng yaxshi?" → "qanday boshlagan ma’qul?"; "Nechta asosiy fikr?" → "…bo‘lgani ma’qul?"; "Bilganimcha." (as far as I know) → "Bilganimning hammasi." (as many as I know); "Shu, rahmat." → "Bo‘ldi, shu, rahmat.".
- `diagnostic.ts:59` ru "домашку" (slang in a test) → "домашнее задание".
- `diagnostic.ts:77` (consistency) uz/ru "detail people can see" aligned with the lesson ("ko‘z oldiga keltira oladigan", "деталью, которую можно увидеть").
- `diagnostic.ts:81` uz can-do "Odamlar eslab qoladigan fikrga ega qisqa haqiqiy hikoya" → "Fikri esda qoladigan qisqa haqiqiy hikoyani so‘zlab bera olaman."
- `diagnostic.ts:97` ru "«Это нехороший вопрос»" (connotes "nasty") → "«Это плохой вопрос»".
- `diagnostic.ts:99` uz/ru prompt: "G‘oyangiz bizni bola deb hisoblaydi" / "Ваша идея считает нас детьми" (an idea cannot "consider") → "G‘oyangiz bizni yosh bola o‘rnida ko‘radi" / "Ваша идея обращается с нами как с детьми"; "Mohir javob?" → "Mohir notiq qanday javob beradi?".
- All 15 question keys checked: one right answer each, same in every language; the intro count (22 items) matches.

## Q&A role-plays (`speech/roleplays.ts`)
Counts: language 20 · fact 1 · answer 0 · consistency 3 · honesty 1 · placeholder 0
### Changes
- `roleplays.ts:23` (language) shared goal uz "Oxirida asosiy xabaringizga qaytib bog‘lang" → "Oxirida nutqingizning asosiy fikriga qayting" (same in samples.ts).
- (language, gender) 6 × ru learner roles used masculine participles/relative clauses ("Вы основатель, который только что выступил", "Вы ученик, который предложил клуб", "Вы учитель, который выступал", "…представивший…", "…предложивший…", "…проводивший…") → neutral wording ("…и вы только что выступили с питчем", "Вы учитесь в этой школе, и клуб предложили вы", "Вы — учитель, это ваше выступление", "…приложение представляли вы", "Вы живёте в этой махалле, и субботник предложили вы", "…презентацию проводили вы").
- `roleplays.ts:151` (appropriateness) the mahalla elder's opening assumed a male learner ("Good idea, son" / "o‘g‘lim" / "сынок") → "Good idea, my dear" / "bolam" / "Хорошее дело задумали.".
- `roleplays.ts:57` ru "приложение, связывающее фермеров с рынка и кафе" (ambiguous) → "приложение, которое связывает кафе с фермерами, торгующими на рынке"; uz "bozor fermerlarini" → "bozordagi fermerlarni".
- `roleplays.ts:73` (consistency) director style said "domla … are not needed but … domla are welcome" (self-contradictory, model-facing) → 'in Uzbek "domla" or "ustoz", in Russian his first name and patronymic are welcome but not required'; ru "наборы роботов" → "наборы для робототехники".
- `roleplays.ts:77` (honesty) goal "concrete safeguard" was "aniq kafolat" / "конкретной гарантией" (a guarantee) → "aniq ehtiyot chorasi" / "конкретной мерой предосторожности".
- `roleplays.ts:96-99` conference: ru "Вы выступили на пятнадцать минут о преподавании лексики через игры" → "Вы выступили с пятнадцатиминутным докладом о том, как учить лексику с помощью игр"; uz goal "Xona usulga ishonadigan…" → "Zaldagilar…"; uz opening "darsning yarmini behuda o‘tkazmaydimi" → "bekorga olib ketmaydimi".
- `roleplays.ts:109-116` manager: ru "запуск опаздывает" → "откладывается"; goal rewritten in uz/ru (reason, extra cost, why the new date can be trusted); openings "ikki hafta kechikish" / "две недели опоздания" → "ikki haftaga kechikdik" / "опаздываем на две недели"; plan B goal uz "Yangi sana xavfi uchun B rejani ayting" → "Yangi sanaga xavf tug‘ilsa, zaxira rejangizni ayting", ru "…на случай, если новая дата окажется под угрозой".
- `roleplays.ts:125` parents: ru "Спасибо, учитель." (not how Russian speakers address a teacher) → "Спасибо вам."; "Зачем добавлять ещё экранного времени?" → "Зачем им ещё больше экранного времени?".
- `roleplays.ts:137` university: uz "uni qanday davom ettirishni" (how to continue) → "qanday qilib yana tekshirish mumkinligini" (how to test further, as en).
- `roleplays.ts:149-150` mahalla: uz role "yosh mahalla aholisisiz" (aholi = population) → "Siz shu mahallada yashaysiz va tozalashni o‘zingiz taklif qildingiz"; ambiguous ru goal "одобрение старших и добровольцев" → "Получите одобрение старших и найдите добровольцев на субботу" (uz same).
- `roleplays.ts:160-168` customer: ru title "недовольный" → "рассерженный" (en angry); uz setting rewritten ("Tugatayotganingizda jahli chiqqan bir kishi odamlar orasidan oldinga o‘tdi"); uz goal "gaplashishga tayyor qiling" → "siz bilan gaplashishga rozi qiling"; ru goal "прежде чем давать факты" → "прежде чем переходить к фактам"; persona role clarified (model-facing).
- `roleplays.ts:174` (fact) debate setting said the opponent "gets two questions" but the hidden-state rules run three (freedom, emergencies, enforcement) and maxTurns is 8 → "The opposing speaker may now question you." (uz/ru same).
- `roleplays.ts:187` ru "вы представили идею кампании на десять минут" → "вы десять минут представляли идею рекламной кампании".
- `roleplays.ts:200-203` toast: uz "siz va yoshlar haqida" → "siz va kelin-kuyov haqida"; persona name "Mohira opa" → "Mohira xola" (she is the learner's aunt; the uz setting already says "xolangiz"); ru goal "сохраняя приятный разговор" → "чтобы разговор оставался приятным".
- Checked: hidden states, concerns, initial values and goals agree with each scenario; personas are plausible in Uzbekistan (startup hub, state school, regional news, Samarkand teachers' conference, mahalla, mall demo, student union, agency interview, family celebration) and suitable from age 13. The director (ru) and the aunt (ru) use ты with the learner, which fits those scenes.

## Samples (`speech/samples.ts`)
Counts: language 10 · fact 1 · answer 0 · consistency 5 · honesty 1 · placeholder 0
### Changes
- (consistency) "o‘ylab topilgan" / "(вымышленная)" → glossary "to‘qima o‘quvchi" / "вымышленная ученица / вымышленный ученик" for Malika, Jasur and Kamila.
- `samples.ts:28` (fact) flow note "152 wpm is at the fast end" contradicted the rubric's 110–170 comfortable range → "152 wpm is within the comfortable range, but there is only one pause in the minute and all four fillers came in the second half." (uz/ru same). Scores re-checked: talk overall 3 = weighted mean 3.09 → 3; Q&A overall L3+ = 3.62 → 3.5; 4 fillers/min at 152 wpm.
- `samples.ts:18` uz "qayta yozish uchun" (rewrite) → "qayta yozib olish uchun" (re-record).
- `samples.ts:36` model line: uz "testidan yiqildi" (slang) → "testidan o‘ta olmadi"; the ru better line lacked "по математике"; uz why "unga ta’sir qilish imkonini beradi" → "uni yaxshiroq yetkazadi".
- `samples.ts:46` uz "188 dan 151 so‘zga, … L2+ dan L3 ga" (detached suffixes) → "188 so‘zdan 151 so‘zga, … L2+ darajadan L3 darajaga".
- `samples.ts:61-62` uz "(/) belgilarni" → "qiya chiziqlarni (/)"; ru "Паразитов стало меньше всего там" (reads "fewest") → "Больше всего паразитов убавилось там"; "замедляйтесь ещё" → "ещё сильнее".
- `samples.ts:73-74` uz "jamoa savolida chalg‘idi" → "jamoa haqidagi savolda gapni cho‘zib yubordi"; ru "расплылась на вопросе о команде" (wrong word) → "слишком затянула ответ о команде".
- `samples.ts:86,93` uz quote "hamtasischim" (not a word) → "hammuassisim" (co-founder) in both the evidence and the better line (an authored translation, not a learner mistake the sample is about; no calibration depends on it).
- `samples.ts:88,94` ru note "переосмыслила угрозу" → "повернула угрозу конкурента в свою пользу"; why lines rewritten in uz/ru ("Cheklovni halol tan olish va keyinroq javob berish va’dasi…", "Честно признанное ограничение и обещание прислать ответ…").
- `samples.ts:101` (honesty) plan title "a week in 'Speaking confidence in 60 days'" (an outcome promise, and the sample is an eight-week plan) → "Example: a week of an eight-week speaking plan" / "Namuna: sakkiz haftalik nutq rejasidan bir hafta" / "Пример: неделя восьминедельного плана выступлений"; uz preview "L4 maqsadiga" → "L4 darajasiga yetish uchun".

## Calibration (`speech/calibration.ts`, rationale/task only)
Counts: language 0 · fact 1 · answer 0 · consistency 1 · honesty 0 · placeholder 0
### Changes
- `calibration.ts:176` (fact) t09 rationale "150 wpm is a little fast" → "inside the comfortable range but brisk, with only one pause" (matches the rubric range; score unchanged).
- `calibration.ts:365` (consistency) q12 task: the learner addresses the director as "opa" while rp.qa-director's persona is a man → the task now says "the school director (a woman in this sample, addressed as "opa")". Learner text and evidence untouched.

## index.ts
No learner-facing text; nothing to change.

## [VERIFY]
- `rubrics.ts`, `plan.ts` fluency, `manifest.ts` too_fast, `lessons.ts` pace: the 110–170 wpm "comfortable" range and the ~170 wpm "too fast" line have no source in the pack. Now worded as guidance; the owner may want a source, or keep them as Schood's own guide.
- `supabase/functions/schood-ai/engage/content/journeys.ts:199` (not my scope): the journey name "Speaking confidence in 60 days" / "Уверенная речь за 60 дней" reads as an outcome promise. The speech sample no longer quotes it; the journey's owner should decide.
- `samples.ts:54` weekly row "Long pauses per talk" 1 → 3 has no `lowerIsBetter`, so the UI may show more long (≥2 s) pauses as an improvement, while the rubric treats long searching silences as negative. Data, not text: left.
- `calibration.ts` t01/t02/t03: `metrics.fillers` is 6 while the transcripts show 5, 7 and 5 fillers. Sample data: left.
- `diagnostic.ts:92`, `calibration.ts` t12, q11: the currency is written "sum" in English text; "soum" is also common. Left.
- `drills.ts` (other reviewer): uses "ishora/Ishora" for signposts (lines ~29, 39, 65, 67). In Uzbek "ishora" also means a gesture; the lessons now use "o‘tish iborasi". Worth aligning.

## Glossary proposals
- signpost (spoken transition): en signpost · uz o‘tish iborasi (not "ishora": it also means a gesture) · ru связка.
- hostile question: en hostile question · uz dushmanona savol · ru враждебный вопрос (already used this way across the pack).
- elevator pitch: keep "elevator pitch" untranslated in all three, as the pack does; ru short form "питч".

## Checks run
- `check.ts speech`: ✓ (42 activities, 2 rubrics, 22 diagnostic items).
- `calibration.ts speech`: ✓ speech.talk and speech.qa (exact 0.867, adjacent 1, MAE 0.067, evidence 1).
- `deno test --no-lock packages/coach-packs/test/`: 22 passed, 0 failed.
- `deno test --no-lock --allow-all supabase/functions/schood-ai/coach/`: 32 passed, 0 failed (includes e2e-speech).

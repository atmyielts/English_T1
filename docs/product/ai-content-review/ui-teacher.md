## Teacher UI catalogs (`apps/schood-ai/src/teacher/i18n/en.ts`, `uz.ts`, `ru.ts`)

All 841 keys read side by side (en/uz/ru). No keys, ids or code changed; key sets stay identical.
253 string edits: en 14 · uz 117 · ru 122 (184 distinct keys). Full before/after list:
(edit script kept outside the repo); untouched originals in (edit script kept outside the repo).

Counts: language 92 · fact 9 · answer 0 · consistency 118 · honesty 0 · placeholder 34

### Changes

**Consistency: glossary product names and terms**
- `uz/ru` (consistency) **Materials Studio** was translated ("Materiallar studiyasi", "Студия материалов") in
  `teacher.nav.studio`, `teacher.home.studioEyebrow`, `teacher.studio.eyebrow` → "Materials Studio" (glossary: never translated;
  core and centre catalogs already say Materials Studio).
- `uz/ru` (consistency) **Live Quiz** was "Jonli viktorina" / "Живая викторина" in 8 keys: `nav.quiz`, `nav.play`, `kind.live_quiz`,
  `export.quiz`, `export.quizNone`, `quizzes.title`, `quizzes.noneLead`, `play.title` → "Live Quiz" ("Live Quiz’ga qo‘shilish",
  "Войти в Live Quiz", "Live Quiz sifatida o‘tkazish", "Провести как Live Quiz"). `quizzes.noneLead` quotes the new button label.
  The Telegram "quiz poll" (`post.quiz`, `channel.lead`) keeps "viktorina" / "викторина": it is a different thing.
- `ru:742` `teacher.market.freeOnly` (consistency) «Утвердить и запустить» → «Подтвердить и выполнить» (the real button, core
  `approvals.approve`). `uz`: “Tasdiqlash va bajarish” → «Tasdiqlash va bajarish».
- `ru:420` `teacher.export.prepare` «Подготовить к утверждению и запуску» → «Подготовить к подтверждению» (verb of the button that
  follows; the literal «…к «Подтвердить и выполнить»» is ungrammatical). `uz` "Tasdiqlab bajarishga tayyorlash" → "Tasdiqlashga tayyorlash".
- `ru` `teacher.job.decideLead` (consistency + language) quoted «Утвердить и сохранить», but the button (core `review.approve`) is
  «Одобрить и сохранить» → quote fixed; "его можно печатать, играть или задавать" → "его можно распечатать, провести как игру или
  задать ученикам". `uz` quotes → «Tasdiqlash va saqlash» (matches core uz), "o‘ynash … topshiriq qilish" → "o‘yin sifatida o‘tkazish …
  o‘quvchilarga vazifa qilib berish".
- `ru` (consistency) teacher = **преподаватель** (glossary; core/centre ru use it): 6 × "учитель" → "преподаватель"
  (`home.playTitle` "Ваш преподаватель начал игру?", `studio.tools`, `export.marketLead`, `print.foot`, `market.eyebrow`, `market.lead`).
  `uz` 2 × "ustoz" → "o‘qituvchi" (`home.playTitle`, `print.foot`).
- `ru` (consistency + language) "Копия учителя / ученика" (calque) → "Для преподавателя" / "Для ученика" (`page.tab.*`, `print.teacher`,
  `print.student`), label `print.copy` "Копия" → "Экземпляр"; `view.scriptHidden`, `editor.explanation`, `export.handoutLead` aligned.
- (consistency) placement test = daraja testi / тест уровня: `kind.placement_test` ("Daraja aniqlash testi" → "Daraja testi",
  "Тест на определение уровня" → "Тест уровня"); `checks.code.question_level_missing` uz said "joylashtirish testidagi" (literal
  "placement", wrong) → "daraja testida"; ru "в тесте на уровень" → "в тесте уровня".
- (consistency) rubric = mezonlar jadvali / критерии оценивания: `view.rubric`, `block.rubric`, `marking.rubric`,
  `kindHint.writing_task`, `marking.schoodRubric`, `editor.openNoKey`, `marking.lead` (uz "Mezonlar"/"baholash mezonlari" →
  "Mezonlar jadvali"; ru "Критерии"/"Критерии оценки" → "Критерии оценивания").
- `uz` (consistency) AI = "AI": 3 × "Sun’iy intellekt" → "AI" (`job.error.ai_failed`, `export.quizFree`, `marking.lead`).
- `ru` (consistency) leaderboard = рейтинг: `quiz.leaderboard` "Таблица лидеров" → "Рейтинг", `play.nicknameHint` aligned.
  feedback = обратная связь: `marking.feedbackLanguage` "Язык отзыва" → "Язык обратной связи", `feedback.purpose.individual`
  "Отзыв ученику" → "Обратная связь ученику". estimate = примерный: `marking.level` "Оценка уровня" → "Примерный уровень".
- `uz` (consistency) suffix rules: 5 × "Telegram’da/’ga" → "Telegramda", "Telegram xabarlariga"; 2 × "{bot} ni" (separate suffix) →
  "{bot}’ni" (`channel.step1`, `channel.error.bot_not_admin`).
- `uz` (consistency) one word per thing: "karta/kartalar" → "kartochka" (glossary deck = kartochkalar) in `kind.speaking_cards`,
  `kindHint.speaking_cards`, `kindHint.ielts_speaking` ("2-qism mavzu kartochkasi", glossary cue card), `kindHint.textbook_lesson`,
  `editor.cardTitle`, `block.cards` ("Gapirish kartochkalari", so it no longer reads like `block.flashcards`).
- `uz` (consistency) versions vs options both said "variant" on one editor screen → versions = "versiya": `editor.versions`
  "Versiyalar", `print.version` "Versiya", `checks.code.variant_count`, `studio.variantsHint`; tab labels `variant.support/stretch`
  "Yordamchi/Murakkab" → "Yengillashtirilgan/Murakkablashtirilgan" (matching ru «Облегчённая/Усложнённая»).
- `uz` (consistency) word box: "So‘zlar qutisi" (calque) → "So‘zlar ro‘yxati" (`editor.wordBox`, `checks.code.gap_answer_not_in_box`,
  `checks.code.word_box_too_small`), as ru «Список слов».
- `ru` (consistency) brief = «описание», not «задание» (which is the task): `studio.brief` "Описание материала",
  `job.failedLead`, `checks.code.question_count`, `error.invalid_brief`. `uz studio.brief` "Topshiriq tavsifi" → "Material tavsifi".
- `ru` (consistency) marking batches «пачка» (colloquial) → «пакет работ»: `marking.batches/none/noneLead/new/batchTitle/create`,
  `error.batch_full`.
- `uz` (consistency) 6 strings with “…” → «…» (glossary uses «» for uz), plus the new strings.
- `uz/ru` (consistency) TOEFL 2026 task list mixed imperatives and nouns in one select → all verbal nouns, like the Multilevel items
  (ru "Восстановление слов", "Чтение повседневных текстов", "Прослушивание и выбор ответа", "Составление предложения",
  "Написание электронного письма", "Ответ в академической дискуссии", "Прослушивание и повторение", "Интервью";
  uz "So‘zlarni to‘ldirish", "Kundalik hayotga oid matnni o‘qish", "Tinglab, javobni tanlash", "Elektron xat yozish",
  "Akademik muhokamada fikr yozish", "Tinglab takrorlash"). en keeps the official ETS task names.

**Placeholders and plural agreement**
- `ru` (placeholder) number + noun that could not agree → plural forms: `quiz.secondsLeft` («Осталась 1 секунда / Осталось 3
  секунды / 20 секунд»), `export.secondsValue` ("{count} секунд" was wrong for 2–4/21), `play.score` and `play.finalScore`
  ("{score} очков" → one/few/many), `marking.markAll` ("Проверить работ: {count}" → "Проверить 1 работу / 3 работы / 12 работ"),
  `feedback.write`, `channel.writeAll` (were "Написать комментарии: {count}"), `studio.issues` ("# пункт проверить" → "# пункт на
  проверку"), `checks.code.gap_answer_too_long` ("длиннее {limit} слов" → "длиннее 1 слова / 3 слов"), `checks.code.word_box_too_small`
  ("всего {words} слов" → "всего 4 слова").
- `ru` (placeholder) colon form where no plural form fits: `checks.code.matching_options_too_few` ("только {options} вариантов" →
  "Пунктов: {questions}, а вариантов: {options}"), `gap_multiple`, `option_count`, `multi_key_count`, `question_count`,
  `variant_count`, `checks.solverLead`, `export.quizLead` ("Вопросов, в которые можно играть с телефонов: {count}" → "Вопросов для
  игры на телефонах: {count}"), `marking.photos`.
- `ru` (placeholder) `quiz.saved` + `quiz.noClass`: "Результаты сохранены: эта игра." → "Результаты сохранены для {label}." with
  noClass "этой игры" (the only use is `QuizHost.tsx:80`). `uz` "{label} bilan saqlandi" → "{label} uchun saqlandi".
- `en` (placeholder) "option(s)", "word(s)" and fixed plurals → plural forms: `checks.code.options_too_few`, `multi_key_count`,
  `gap_answer_too_long`, `word_box_too_small`, `question_count`, `variant_count`, `play.score`, `play.finalScore`
  ("1 points" → "1 point").
- All placeholders checked by script: same names in en/uz/ru for every key; every ru plural has one/few/many/other.

**Meaning / fact**
- `en/uz/ru teacher.job.lead` (fact) "You can leave this page; the draft keeps its place." Writing is driven by the open page
  (`MaterialJob.tsx`: one step per request), so it pauses when you leave and resumes on return. uz/ru calqued it ("qoralama joyini
  saqlaydi", "черновик сохранит своё место") → en "when you come back, writing carries on where it stopped"; uz "qaytganingizda yozish
  to‘xtagan joyidan davom etadi"; ru "когда вы вернётесь, работа продолжится с того же места".
- `uz editor.liveClean` (fact) "Kalit tekshiruvlari o‘tmoqda" (= checks are running) → "Kalit tekshiruvlaridan o‘tdi" (= passed).
- `uz kindHint.quiz` (fact) "kaliti avtomatik tekshiriladi" (the key gets checked) → "avtomatik tekshiriladigan javob kaliti bor".
- `uz job.solving` (fact) "Javob kaliti uni ko‘rmasdan tekshirilmoqda" (the key checks without seeing itself) → "Javob kaliti
  tekshirilmoqda: savollar kalitga qaramasdan yechilmoqda…"; `ru` → "Проверяем ключ: решаем, не заглядывая в него…".
- `uz checks.solverLead` "…{agreed} tasiga qo‘shildi" (joined) → "…{agreed} tasi bilan mos keldi".
- `uz job.confirmLead`, `editor.liveErrors` "{errors} ta tekshiruv o‘tmadi" (checks did not take place) → "Material {errors} ta
  tekshiruvdan o‘tmadi", "{count} ta tekshiruv muvaffaqiyatsiz".
- `ru kindHint.listening` "Текст, который можно … включить" (you cannot switch on a text) → "Текст для чтения вслух или аудиозаписи".
- `en play.finalRank` "You came {rank} of {count}" (needs an ordinal) → "Your place: {rank} of {count}".

**Language (natural uz/ru/en)**
- `en`: `play.guest` "Signed in, your result goes…" → "If you sign in, …"; `checks.code.not_auto_markable` "a quiz that should mark
  itself" → "an auto-marked quiz"; `kindHint.quiz` "a key a machine can check" → "a key that can be checked automatically";
  `checks.none` "within the limit" → "within the word limit".
- `uz`: "o‘quv material" → "o‘quv materiali" (`studio.title`, `page.notMaterial`, `error.not_a_material`); `kind.reading/listening`
  "Savollar bilan o‘qish matni" → "O‘qish matni va savollar"; `kindHint.error_correction`, `kindHint.lesson_plan` ("vaqtli bosqichlar,
  faoliyatlar" → "vaqti belgilangan bosqichlar, topshiriqlar"), `kindHint.course_outline` ("“qila oladi” bayonotlari" → "«qila oladi»
  ko‘rsatkichlari"), `editor.canDo`, `kindHint.sat_math`; dialogue line "Qator" (row) → "Replika" (`editor.line/addLine/removeLine`);
  `editor.optionText/removeOption` "{id} variant" → "{id} varianti"; `checks.note` "qarorni siz qilasiz" → "qabul qilasiz";
  `checks.none` rewritten; `checks.solverPartial` "yechilmadi" → "yechilmagan"; `checks.code.key_position_bias` "{share}% i {option}
  variant" → "{share} foizi — {option} varianti"; `checks.code.cloze_marker_unknown/source_missing` "ishora qiladi" → "bog‘langan";
  `job.confirmTitle`; `marking.from.transcript` "Yozib olingan matn" (= recorded) → "Terilgan nutq matni" (and the quote in
  `marking.speechUnavailable`); `marking.speechNote` "(bitta to‘lov)" → "(kredit bir marta yechiladi)"; `signal.duplicate_media`
  "o‘xshash" → "bir xil"; `signal.title`; `feedback.title` "…hisobot yozuvchi" → "Fikr-mulohaza va hisobot yozish"; `channel.dueNote`;
  `channel.plan/week` ("{week} haftasi" with a full date) → "Haftani rejalashtirish: {week}" / "Hafta boshi: {week}"; `quiz.joinAt`
  "saytiga kiring va kodni yozing" → "saytini oching va kodni kiriting"; `market.queueEmpty` "Hech narsa kutmayapti" → "Navbatda hech
  narsa yo‘q"; `brand.kind`, `brand.contact`, `brand.course.price`; `error.already_confirmed`, `error.material_changed`;
  `studio.topicHint`, `studio.topicsHint`, `studio.notesHint` ("sinf hajmi" → "sinfdagi o‘quvchilar soni"), `studio.variantsHint`;
  `editor.wordBoxHint`, `editor.explanation` "(o‘qituvchi nusxasi)" → "(o‘qituvchi uchun)"; `block.script` "Ssenariy" → "Tinglash matni";
  `checks.review`; `quizzes.lead`; `export.telegramLead`.
- `uz` (length, buttons ≤ 24): `quiz.finishShow` "Yakuniy natijalarni ko‘rsatish" (30) → "Yakunlarni ko‘rsatish";
  `marking.markRecording` (30) → "Matnga o‘girib baholash"; `channel.sendNow` (37) → "Postlarni hozir yuborish";
  `feedback.remove` → "O‘quvchini olib tashlash"; `print.button` → "Chop etish yoki PDF".
- `ru`: `block.script` "Сценарий" → "Текст для аудирования"; `kind.vocabulary` "Лексический набор" → "Подборка слов";
  `kindHint.vocabulary`, `kindHint.multilevel` ("узбекистанского экзамена" → "национального экзамена CEFR Multilevel в Узбекистане"),
  `kindHint.course_outline`/`editor.canDo` ("утверждения «умею»" → "дескрипторы «могу»"); `studio.questions` "Вопросов" → "Число
  вопросов"; `studio.notesHint` "размер класса" → "сколько их в классе"; `status.failed` "Не удалось" → "Ошибка";
  `job.lead`, `job.failedLead` (comma around «возможно»); `checks.none`; `checks.code.ordering_key_incomplete`;
  `editor.wordBoxHint`; `qtype.ordering` "Порядок" → "Расстановка по порядку"; `page.notMaterial`/`error.not_a_material` (dash);
  `page.loadLatest`; `export.homeworkLead` (double «вашей/вашего»), `export.noBanks`, `export.telegramLead`; `print.button`
  "Печать или сохранить в PDF" (noun + verb) → "Печать или PDF"; `marking.title` → "Помощник по проверке работ" (as core
  `plans.teacher.desc`); `marking.lead` "пачками" → "сразу много"; `marking.confirmedNote`; `signal.none`; `channel.dueNote`,
  `channel.sendNow` ("готовые" ≠ due), `channel.timeHint`, `channel.status.error` "Нужно внимание" → "Требует внимания",
  `channel.error.channel_not_found` ("и то, что"), `channel.botMissing`; `market.sortOption.*` ("Самые используемые" →
  "По использованию"); `market.queueEmpty` "Ничего не ждёт" → "Очередь пуста"; `market.reject`; `brand.previous` "Результат до" →
  "Прежний результат"; `brand.course.price`; `error.already_confirmed` ("Измените их вместо этого" calque); `error.bank_not_found`;
  `play.nicknameHint` "Будьте вежливы" → "Выберите вежливый ник"; `studio.pageTextHint`.

**Honesty**: nothing to fix. The marketplace and brand-kit texts already promise no sales, earnings or results ("Nothing is
invented", "Enter only real results", commission "will be shown before paid listings open"); consent wording is in place.

### [VERIFY]
- **Code bug, not text** — `apps/schood-ai/src/teacher/pages/Marking.tsx:50` uses `t('teacher.marking.level')` as the batch's level
  *field label* without a `level` param, so teachers see the literal "Level estimate: {level}" ("Примерный уровень: {level}").
  The key is correct for its other use (line 216). Smallest fix: line 50 → `t('teacher.studio.level')` ("Level / Daraja / Уровень").
  I did not touch code (scope).
- `ru teacher.job.decideLead` now quotes core `review.approve` = «Одобрить и сохранить». If the core reviewer renames that button
  (e.g. to «Утвердить и сохранить», to match the teacher statuses «Утверждён»), update this quote too.
- `uz teacher.print.hint` quotes the browser print dialog's «PDF sifatida saqlash»: I could not confirm Chrome's exact Uzbek label.
- `uz` "tabel" for report card (`feedback.lead`, `feedback.purpose.report_card`) — fine for schools; centres may say "hisobot".
  Left as is.
- `en teacher.home.studioTitle` "Exam-accurate material in minutes" and `studio.lead` "checks every answer key twice": accurate as
  far as the code shows (deterministic checks + blind solver), left unchanged.

### Glossary proposals
- **Approve (a material)**: add a row. Teacher catalogs use ru «утвердить / утверждён» and uz «tasdiqlash»; core `review.approve` is
  «Одобрить и сохранить». Proposal: ru «утвердить» everywhere for materials (button «Утвердить и сохранить»), keep
  «Подтвердить и выполнить» only for Approve & run.
- **Teacher copy / student copy**: uz "o‘qituvchi nusxasi / o‘quvchi nusxasi", ru "для преподавателя / для ученика" (label
  «Экземпляр»), never «копия учителя».
- **Rubric** row: uz "mezonlar jadvali", ru "критерии оценивания" (I applied the lead's list; it is not in the glossary yet).
- **Answer key**: uz "javob kaliti" (not "javoblar kaliti"), ru "ключ ответов" / short "ключ".
- **Brief (material request)**: uz "tavsif", ru "описание" (not «задание», which is a task).
- **Batch (marking)**: uz "to‘plam", ru "пакет работ".
- **Version (core/support/stretch)**: uz "versiya" (since "variant" is an answer option), ru "версия"; support/stretch =
  uz "yengillashtirilgan / murakkablashtirilgan", ru "облегчённая / усложнённая".
- **Word box**: uz "so‘zlar ro‘yxati", ru "список слов".
- **Live Quiz with a suffix**: uz "Live Quiz’ga", "Live Quiz sifatida"; ru «Войти в Live Quiz», «Набор для Live Quiz».
- **Uzbek quotes**: state «…» for uz in the writing rules (the teacher catalog used “…”).

### Checks run
- `deno check --no-lock` on en.ts, uz.ts, ru.ts: pass.
- `deno run --no-lock --allow-read scripts/check-schood-ai-teacher-i18n.ts`: "every key the screens use is in the catalog".
- `deno test --no-lock apps/schood-ai/tests/`: 1 passed, 0 failed.
- Own scripts: placeholder names identical across en/uz/ru for all 841 keys; every ru plural has one/few/many/other; no ' ` ʻ ʼ in uz;
  no “ ” in ru/uz; spot-rendered the new plurals through `packages/service-i18n/src/format.ts` (e.g. «Осталась 21 секунда»,
  «Проверить 1 работу», "1 point").

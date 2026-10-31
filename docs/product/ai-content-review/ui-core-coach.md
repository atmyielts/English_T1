## Schood AI core UI (`apps/schood-ai/src/core/i18n/en.ts`, `uz.ts`, `ru.ts`, `index.ts` BOOT)
Counts: language 50 · fact 3 · answer 0 · consistency 33 · honesty 1 · placeholder 6

Every key (607) compared side by side. Key sets are identical across en/uz/ru. Placeholders match in every key.
BOOT strings in `index.ts` match en.ts exactly, so no change was needed there.

### Changes
- **Fact.** `examples.tutor.prompt/answer` (en, uz, ru): IELTS Listening has **Part 1–4** (the glossary uses Part too), not "Section". "Section 3" → "Part 3", uz "3-bo‘lim" → "3-qism", ru "Section 3" → «часть 3».
- **Fact.** `examples.tutor.answer` (ru, uz): ru said «где упоминались **оба** варианта», which suggests a question with only two options. It now says «два варианта» (uz "ikki variant"). The en is clearer too: "where two of the options were mentioned".
- **Fact/glossary.** ru `plans.family.desc`: «Plus для трёх детей» → «Plus для детей (до трёх)» (the plan covers up to three children).
- **Honesty.** `examples.lead` (all three): the examples (Aziz, the mock results) now say they use invented learners and results: "fixed examples with invented learners and results"; uz "o‘quvchilari va natijalari to‘qima bo‘lgan"; ru «с вымышленными учениками и результатами».
- **English.** `examples.parent.answer`: "he finished every homework on time" (homework is uncountable) → "he handed in all his homework on time". `examples.tutor.answer`: "most lost marks in Section 3 were …" → "most of the marks you lost in Part 3 were on …". `examples.worksheet.answer`: "all 5 answers were solved again … and matched" → "all 5 items were solved again without the key, and the answers matched" (uz and ru now say the same). `error.daily_limit_reached`: "You reached" → "You have reached". `state.signIn.lead`: added the missing comma.
- **en.** `state.consent.open` "Take the step" (unclear button) → "Continue" / "Davom etish" / «Продолжить».
- **Plurals and agreement.** `state.credits.lead` and `state.budget.lead` en now use plural forms ("1 credit"). ru `state.credits.lead` uses `{cost|one|few|many|other}`. en `settings.historyDeleted` and `library.folder.moved` now have plural forms ("1 conversations deleted" was possible before). ru `admin.ws.granted` «Баланс: {total} кредитов» → «Кредиты на балансе: {total}» (`{total}` is preformatted, so no plural form is possible). I left `plans.credits` as it is: `{count}` is a preformatted string, and every value is a multiple of 100, so «кредитов» / "credits" is always right.
- **Glossary, ru.** `nav.group.coach` «Тренеры» → «Коучи». `plans.plus.desc` «тренеры письма…, все шесть тренеров в Telegram» → «коучи по письму и устной речи…, все шесть коучей в Telegram» (I checked the number: the registry has 6 packs). Also «тренировка собеседований» → «подготовка к собеседованиям».
- **Glossary, ru: mock and placement.** «пробный тест» → «пробный экзамен» (`landing.lead`, `examples.tutor.title`, `examples.tutor.answer`). In `home.knows.none` a practice test is «тренировочный тест». `plans.centre.desc` «тесты на уровень» → «тесты уровня».
- **Glossary, ru: AI and feedback.** «AI-запросы» → «запросы к ИИ». «отзывы о письме» → «обратная связь по письму…» (`landing.learners.desc`). «автор отзывов» → «помощник по обратной связи» (`plans.teacher.desc`).
- **Glossary, uz.** "sun’iy intellekt" → "AI" (`landing.title`). "mock" → "sinov imtihoni" (`landing.lead`, `examples.tutor.title`, `examples.tutor.answer`). "taxminiy band: taxminan 6.0" → "taxminiy ball: 6.0 atrofida" (`examples.writing.answer`).
- **Consistency, uz.** "ish joyi" → "ish maydoni" everywhere (7 admin keys and `settings.deleteHistoryLead`), matching the rest of the catalog. "Hisobingiz" → "Akkauntingiz". `assistants.nameHint` “{name}” → «{name}». `library.print.hint` “Save as PDF” ni → «Save as PDF» … bandini.
- **Consistency, ru.** Conversation history used «переписки» and «разговоры» mixed with «чат» (`chat.newChat` «Новый чат»). It now says «чаты» throughout `history.*`, `settings.dataLead`, `settings.deleteHistory*`, `settings.historyDeleted`, `settings.retention` and `landing.trust.data`.
- **Russian.** I fixed these strings:
  - `app.footer`: comma splice → «…и объясняет, а решения принимают люди».
  - `state.capped.*` (4): «по Ташкенту» → «по ташкентскому времени»; «ответил на все вопросы, на которые мог» → «ответил на столько вопросов, на сколько мог»; «Он обновится» → «Лимит обновится».
  - `approvals.lead`: rewritten so it reads naturally.
  - `state.plan.soon`: «в закрытой бете» → «в режиме закрытого бета-тестирования».
  - `plans.centre_pro.desc`: «понедельничная сводка» → «сводка для владельца по понедельникам»; «агент приёма» → «агент по набору учеников».
  - `plans.teacher_pro.for`: «которые продают» had no object → «которые продают свои материалы» (as in uz).
  - `plans.teacher_pro.desc`: «брендовый набор» → «набор для личного бренда».
  - `library.error.*`: «Ваш текст здесь» → «Ваш текст на месте», as in `library.conflict.lead`.
  - Smaller fixes: `library.history.empty` (Ранних → Предыдущих), `library.block.dividerHint` («Разделить разделы» → «Граница между разделами»), `library.byColleague` (Коллеги → От коллеги), `library.savedAnswer`, `error.nothing_to_retry` (полный → завершён), `admin.denied.lead`, `admin.field.noTraining`/`requireNoTraining`, `examples.writing.title`, `examples.tutor.answer` (повороты → фразы, «соглашаются на вторую» → «сходятся на второй»), `credits.noPlan`, `home.teacher.prompt2` (Part 1 → часть 1), `landing.trust.facts` (Он → Schood AI).
- **Uzbek.** I fixed these strings:
  - `landing.learners.desc`: "O‘z xatolaringiz tushuntirishi" was ungrammatical → "Xatolaringiz tahlili…".
  - `plans.plus.desc`: "xatolaringiz tushuntirishi" → "tahlili"; "suhbat mashqlari" was ambiguous → "ish suhbatiga tayyorgarlik".
  - `home.credits.budget`: "{limit} dan {left} qoldi" → "{limit} kreditdan {left} kredit qoldi".
  - `home.approvals.none`: "Sizni hech narsa kutmayapti" (a calque) → "Qaror kutayotgan hech narsa yo‘q".
  - `credits.noPlan`: "Tarifsiz tarif kreditlari bo‘lmaydi" → "Tarif bo‘lmasa, tarif kreditlari ham bo‘lmaydi".
  - `chat.context`: "Foydalanildi" → "Hisobga olindi".
  - `examples.tutor.answer`: "burilishlarga" → "iboralarga"; "kelishadi" → "kelishib olishadi".
  - `home.teacher.prompt2`: "qizdiruvchi savol" → "razminka savoli".
  - `library.mode.preview`: "Ko‘rib chiqish" (that means review) → "Oldindan ko‘rish".
  - `library.tool.redo`: "Qaytarish" (reads like undo) → "Qayta bajarish".
  - `library.duplicate`: was the same as Copy → "Nusxasini yaratish".
  - `admin.audit.filter`: "Saralash" (that means sort) → "Filtrlash".
  - `error.timeout`: "juda uzoq javob berdi" (reads as "answered at length") → "javobi juda kechikdi".
  - Smaller fixes: `app.footer` (added "esa"), `home.tools.soon`, `state.capped.retry`, `approvals.lead`, `library.error.tooLong` ("saqlash uchun" was missing), `library.readOnly`, `library.editor.placeholder`, `library.folder.rename`, `notify.daily`, `error.daily_limit_reached` (chegara → limit, as in the other limit strings), `admin.field.*`, `admin.test.tokens`.
- **Length (375 px).** I shortened these labels:
  - uz `state.plan.see` → "Tariflar va namunalar"; ru → «Тарифы и примеры».
  - uz `library.print.button` → "Chop etish yoki PDF"; ru → «Печать или PDF».
  - uz `library.conflict.mine` → "Versiyamni saqlash".
  - uz `admin.reports.review` → "Ko‘rib chiqildi".
  - ru `library.save.dirty` → «Несохранённые изменения».

### [VERIFY]
- `core/i18n/uz.ts` `history.unpin` "Mahkamlashni olib tashlash" (26 chars) is a little over the 24-character target. It sits in a flex-wrap row, so I left it. Change it if there is an established Uzbek term for "Unpin".
- `core/i18n/ru.ts` `home.teacher.prompt1–3`, `examples.writing.prompt`: the example prompts address the AI as ты («Спланируй», «Напиши», «Проверь»), while uz uses siz. These are the user's own words to the AI, so I left them. Confirm this is intended.
- `plans.family.desc`: Family gets 300 monthly credits (`MONTHLY_CREDITS.family`) and Plus gets 1,500. The copy says "Plus for up to three children". Please check that this claim matches what the plan actually grants (product, not wording).

## Coaches UI (`apps/schood-ai/src/coach/i18n/en.ts`, `uz.ts`, `ru.ts`)
Counts: language 30 · fact 3 · answer 0 · consistency 22 · honesty 3 · placeholder 3

Every key (332) compared side by side. Key sets are identical, and placeholders match.

### Changes
- **Fact.** `coach.card.lead` (all three) described only "IELTS and everyday speaking coaches". There are six packs (IELTS, Speaking, Admission Maths, Sales, Career, Public Speaking). It now lists all six, and ru no longer says «с доказательствами» (it says «показывают, на чём основана оценка»).
- **Fact.** `coach.scripts.practiseHow` pointed to a bot menu item "Role-plays → Practise with your buyer". In the sales bot that menu is **"📞 Sales calls" / "Savdo qo‘ng‘iroqlari" / «Звонки»** (`sales/manifest.ts`), and the button is "Practise with your buyer" / "Mijozingiz bilan mashq" / «Тренировка с клиентом» (`copy.ts` `script.practise`). The path now matches those labels in all three languages. **Lead: if another reviewer renames those bot labels, update this string to match.**
- **Fact.** `coach.cohort.soon` "once {min} people" → "once at least {min} people" (uz "kamida", ru «хотя бы»): `MIN_COHORT` is a minimum.
- **Honesty.** `coach.cohort.percentile` now says it is approximate: "Ahead of about {percentile}% of the {people} learners who took a mock with this coach…". uz "taxminan … foizidan oldindasiz" (also fixes the broken "{percentile}% idan"). ru «Вы опережаете примерно {percentile}% учеников…» (also fixes the agreement «за последние {days} дней» → «дн.»).
- **Honesty.** `coach.session.estimate`: uz "mashq bahosi" → "taxminiy baho"; ru «Оценка практики» → «Примерная оценка» (glossary: estimates are taxminiy / примерная).
- **Glossary, ru.**
  - `coach.session.better`: «Скажи лучше» → «Как сказать лучше».
  - `coach.slot.roleplay`: «ролевые диалоги» → «ролевые игры» (uz "rolli suhbatlar" → "rolli o‘yinlar").
  - `coach.session.ladder` → «"Лестница" эссе».
  - «наборы задач» → «наборы заданий», as in `coach.slot.practice` (`coach.mistakes.lead`, `coach.mistakes.emptyLead`).
  - follow-up → «сообщение для повторного контакта (follow-up)» (`coach.scripts.lead`, `coach.scripts.followUp`).
  - «Фразы для закрытия» → «…сделки».
- **Glossary, uz.**
  - "kartalar" → "kartochkalar" (`coach.reason.due_cards`, `coach.report.cardsReviewed`, `coach.report.cards`, `coach.settings.eraseLead`).
  - Bare "to‘ldiruvchi" → "to‘ldiruvchi so‘zlar" (`coach.report.fillers_per_100`, `coach.metric.fillersPerMinute`, `coach.samples.metrics`).
  - «avval va hozir» → «oldin va hozir» (`coach.settings.dataLead`).
  - "mini sinov" → "mini-sinov" (4 keys).
  - "o‘ylab topilgan o‘quvchi" → "to‘qima o‘quvchi" (`coach.samples.lead`).
  - follow-up → "keyingi aloqa (follow-up)".
  - `coach.scripts.pitch` "Qiymat taqdimoti" → "Foydani taqdim etish" (value = foyda).
- **Placeholders and plurals.**
  - en `coach.home.streak` and `coach.samples.week`: "5 day streak" → "5-day streak".
  - en `coach.session.scorecard` "asked {questions} questions" now has a plural form.
  - ru `coach.mistakes.count` «# вопрос исправить» (ungrammatical) → «# вопрос на исправление» (one/few/many/other).
  - ru `coach.mistakes.missed` «ошибка # раз» → «ошибались # раз».
  - uz `coach.session.scorecard` "{ratio}% ini" → "{ratio} foizini" (as the bot copy writes it).
  - uz `coach.team.remove` "{name} ni chiqarish" (a detached suffix) → "Jamoadan chiqarish: {name}".
- **ru `coach.plan.mock`.** The template rendered «Мини-пробник: каждый день недели «воскресенье»». It is now `{title}: {day}.`, and the ru `coach.day.*` values are «по воскресеньям», «по понедельникам», and so on. Those keys are used only in this sentence (`Plan.tsx:72`). uz and en are unchanged and still use the nominative.
- **Russian.** I fixed these strings:
  - `coach.session.ladderNote`: «Образцы переписанного вами же эссе» meant "rewritten by you" → «Образцовые переработки вашего эссе».
  - `coach.timer.note`: «тайминг» → «проверит, уложились ли вы во время».
  - `coach.shadow.back`: «запишите себя» → «запишите голосовое сообщение».
  - `coach.cert.lead`: «её может проверить» (её pointed to the link) → «любой сможет проверить сертификат».
  - `coach.mistakes.howTo`: added «вы получите».
  - `coach.link.step3`: «Старт» → «Запустить» (Start), the label of Telegram’s Russian bot button; see [VERIFY].
  - Smaller fixes: `coach.dash.skillsNote`, `coach.dash.forecast` (added colon and semicolon), `coach.link.confirmed` (Готово → Аккаунт привязан), `coach.session.overall` (Итого → Итог:), `coach.session.audioLead`, `coach.scripts.building` (Собираю → Собираем, as in Сохраняем…), `coach.scripts.nextSteps`.
- **Uzbek.** I fixed these strings:
  - `coach.session.ladderNote`: "inshoyingiz" → "inshoingiz".
  - `coach.samples.lead`: "Hisobotlaringiz qanday ko‘rinishi." (a fragment) → "Hisobotlaringiz shunday ko‘rinadi."
  - `coach.verify.note`: "daraja … erishilgan" → "bu darajaga … erishilgan".
  - `coach.link.step3`: "Tasdiqlash’ni bosing" (the apostrophe suffix on an Uzbek word) → «Tasdiqlash» tugmasini bosing.
  - `coach.slot.speaking`/`writing`: "speaking", "yozuv" (inconsistent with "o‘qish", "tinglash") → "gapirish", "yozish".
  - Smaller fixes: `coach.dash.best` → "rekord: {count}", `coach.dash.forecast` ("({confidence} ishonch" → "ishonch darajasi: {confidence}"), `coach.report.emptyLead`, `coach.plan.minutes`, `coach.plan.weeks`, `coach.plan.focus`, `coach.settings.noReminder`, `coach.session.overall`, `coach.session.set` ("tasi"), `coach.session.facts` ("o‘zgarib turadi"; "{date} da" → "{date} kuni", also in `factsStale`), `coach.samples.plan`, `coach.shadow.back`, `coach.team.seats`, `coach.scripts.watchOutsLead` (the "[belgini]" placeholder was garbled).
- **English.** `coach.cohort.none`: "what it means on the exam blocks" → "what it means for each block of the exam".
- **Length.** I shortened these labels:
  - `coach.link.button`: uz "Telegramni ulash", ru «Привязать Telegram" (they were 26 and 28 chars).
  - `coach.samples.see`: uz "Namunaviy hisobotlar", ru «Примеры отчётов».
  - `coach.scripts.practise`: uz "Telegramda mijozingiz bilan mashq", ru «Тренировка с клиентом в Telegram». The ru label was 43 chars, and it now matches the bot button.

### [VERIFY]
- `coach/i18n/ru.ts` `coach.link.step3`: I believe the Russian Telegram clients label the bot start button «Запустить», while older ones said «Старт». The string now says «Нажмите «Запустить» (Start) в Telegram». Check it on a current Russian-language client.
- `coach.team.*` "Coach Team": it reads like a product name ("get Coach Team seats"), but ru translates it as «Команда коучей» ("a team of coaches") and uz as "Murabbiy jamoasi". I left it because it is not in the glossary; see the proposal below.
- `coach.session.title` ru «Разбор» vs the glossary’s feedback = «обратная связь». I kept «Разбор» because the bot copy uses «разбор» for the same review (`rp.review`, `rp.ending`).

### Checks run
- `deno check --no-lock` on the 6 edited catalogs: passes.
- `deno test --no-lock apps/schood-ai/tests/`: 1 passed.
- `index.ts` was not edited. `deno check` on it fails in `packages/service-i18n/src/i18n.tsx:43` (JSX types under Deno), and it fails the same way before my edits.
- I rendered the new plural strings through `format()` in all 3 languages (1, 3 and 5) and checked the output, for example "Нужно 3 кредита", "1 question" and "ошибались 5 раз".

### Glossary proposals
- **Coach Team** (B2B seats for companies and centres): add it as a product name that is never translated (Coach Team / Coach Team / Coach Team), or give approved translations. Today the ru «Команда коучей» means "a team of coaches".
- **Unpin** (history): uz "Mahkamlashni olib tashlash" is long. Propose a short approved form.
- **Conversation history** (ru): «чат», «чаты», as in «Новый чат», «История чатов». Avoid «переписки» and «разговоры» for saved threads.

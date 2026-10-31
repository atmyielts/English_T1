# UI catalogs review: engage + learner (apps/schood-ai/src)

Method: every key compared en/uz/ru side by side (script-parsed); edits applied by key with a
script that checks each key hit exactly once; afterwards a validator checks identical key sets,
identical placeholder names in all three languages, plural syntax (en one/other, ru
one/few/many/other), braces, Uzbek apostrophes and Russian quotes. Facts in copy checked against
`supabase/functions/schood-ai/engage/*` and `_shared/english-{xp,streak}.ts` (league 30/7/5,
freeze every 250 XP / max 2, comeback 3 activities, journeys max 3, squad max 5, 20 dates,
national mock Sat 10:00 to Sun 22:00, speaking + sales tournaments monthly): all consistent.

## Engage shell (engage/i18n/en.ts, uz.ts, ru.ts)
Counts: language 0 · fact 0 · answer 0 · consistency 2 · honesty 0 · placeholder 0
### Changes
- `uz.ts` / `ru.ts` `engage.memory.title` (consistency) "Coach nimani eslab qoladi" → "Murabbiy
  nimani eslab qoladi"; «Что помнит тренер» → «Что помнит коуч» (glossary: murabbiy / коуч).

## Engage pages (engage/i18n/pages.en.ts, pages.uz.ts, pages.ru.ts)
Counts: language 118 · fact 2 · answer 0 · consistency 40 · honesty 2 · placeholder 29
(31 en edits, 81 uz, 110 ru; counts by main reason, many edits fix more than one thing.)
### Changes
- (fact) `engage.passport.linkLabelHint` said "Only you see this label", but the public Skill
  Passport page prints it (`PublicPassportPage` → `publicLead {label}`; `passport.ts` returns
  `label`). Now en "Whoever opens the link sees this label too." / uz "Havolani ochgan kishi ham
  bu yorliqni ko‘radi." / ru «Эту подпись увидит и тот, кто откроет ссылку.» `publicLead`
  "Shared as “{label}”" → "Shared for “{label}”" (the label is "Who is it for"), uz/ru to match.
- (fact) ru `engage.streak.freezeRule` «Её даёт каждые 250 XP» (ungrammatical, reads as wrong
  subject) → «Одну заморозку вы получаете за каждые 250 XP; хранить можно не больше двух.»
- (consistency, glossary) uz streak freeze: 7 × "muzlatgich" (= refrigerator) → "muzlatish"
  (`streak.freezes` "{max} tadan {count} ta muzlatish", `freezeRule`, `buy`, errors
  `freeze_limit`, `freeze_week_used`, `personal_only`, `freeze_failed`).
- (consistency) uz weekly challenge "Haftalik sinov" / "haftalik sinov" → "Haftalik chellenj"
  (`challenge.title`, `progress.lead`).
- (consistency) coach: uz "coach"/"Coach’lari" → "murabbiy"/"murabbiylari" (`memory.eyebrow`,
  `memory.lead`, `memory.emptyLead`, `quest.scored_turn`, `journeys.lead`, `cert.lead`,
  `passport.source.coach`); ru «тренер/тренеру/тренеров/Тренеры» → «коуч/коучу/коучей/Коучи»
  (same keys).
- (consistency) bare "Passport" → "Skill Passport" in en/uz/ru `thenNow.private`,
  `talent.consent.what`, `talent.passport`, `talent.view`.
- (placeholder/plural) English counts without plural forms ("1 days left", "1 weeks"):
  `season.pill`, `settings.minutes`, `memory.habitLine` (days and streak), `journeys.weeks`,
  `passport.journey`, `passport.days`, `passport.linkStats`, `story.count`, `story.minutes`,
  `sitting.part1`, `sitting.pending` now use `{n|one:…|other:…}`.
- (placeholder/plural) Russian number agreement: quests/challenges (`quest.checks_3`,
  `challenge.days_5`, `checks_15`, `stories_3`, `turns_10`), `season.pill`, `memory.habitLine`,
  `passport.days` («{count} дней» for 7/30/90/365 gave «7 дней» ok but the form is now safe),
  `sitting.part1` now use one/few/many/other. Minutes after a placeholder → «{n} мин.» per glossary
  (`quest.minutes_*`, `challenge.minutes_90`, `limit.reached`, `settings.minutes`, `squad.goal`,
  `squad.minutes`, `cert.minutes`, `story.minutes`, `cert.rule.time`); seconds → «{n} с»
  (`sitting.speakRule`).
- (placeholder) `challenge.left` gets a weekday name (`date(…, { weekday: 'long' })`): ru «если
  успеете до: воскресенье» → «{progress} из {target}. Срок — {date}; за выполнение +{xp} XP.»;
  uz "{date} gacha" → "{date}gacha" (→ "yakshanbagacha").
- (placeholder) `league.result.*` en "Last week you were 3 in Bronze" ({rank} is a bare number)
  → "Last week: place {rank} in {tier} with {xp} XP. You moved up." (stayed/demoted alike); uz/ru
  outcome clauses made natural ("siz yuqori ligaga chiqdingiz", «вы перешли в лигу выше»).
- (placeholder) ru `settings.messagesNow` «по времени Asia/Tashkent» → «(часовой пояс {zone})».
- (language) Squad duel lines render as "You: …" / "Name: …": uz "Siz: duelda g‘alaba qozondi"
  and ru «Вы: выиграл(а) дуэль» were wrong for "Siz/Вы" and gendered → noun phrases: uz "duelda
  g‘alaba / duelda ishtirok / duelda durang", ru «победа в дуэли / участие в дуэли / ничья в
  дуэли». Same for `squad.learnedToday` (badge also shown for you): uz "Bugun mashq qilingan",
  ru «Сегодня была практика»; uz `squad.today` "Bugun mashq qilganlar".
- (language) Gendered ru forms removed: `path.already` «Я уже это сделал(а)» → «Это уже сделано»;
  `cert.consent`, `talent.agree` «Я согласен(на)» → «Я принимаю…» / «Я даю согласие…»;
  `signal.focus_loss/return` «Ушёл/Вернулся» → «Уход со страницы / Возврат на страницу».
- (language) en `firstStep.lead` "keeps your day" → "counts for today" (uz/ru calques fixed too);
  en `comeback.lead` "{done} of {needed} … brings it back" (ungrammatical) → "{done} of {needed}
  learning activities done. Finish them by {date} and your streak comes back. It takes learning,
  not money."; `path.selfReported` "Your own word" → "Self-reported" (+ hint; uz "O‘z so‘zingiz"
  → "O‘zingiz bildirgan"); `events.allBadges`, `events.sponsor` ("Sponsored by {name}"),
  `squad.nudgeRule`, `nudge.already_nudged_today` ("Already sent today"), `cert.pass`,
  `cert.rule.time`, `error.user_token_required` reworded.
- (language) uz calques and grammar: "Seriyangiz xavfsiz" → "Seriyangiz saqlanib qoldi";
  "yashiringansiz" → "ko‘rinmaysiz"; "Bu haftalik duellar" → "Bu haftadagi duellar"; "Har
  o‘quvchiga {xp} XP" → "O‘quvchi boshiga {xp} XP"; `boards.centresEmpty` (subject/verb order),
  `journey.startLead` ("{weeks} haftalik bob" read as "a 16-week chapter") → "Har hafta bitta bob,
  jami {weeks} ta."; "Yozish" (record) → "Yozib olish"; "Yozuvingiz" (writing) → "Yozma ishingiz";
  "Kirish matematikasi" → "Matematika (oliygohga kirish)"; "o‘tilgan tekshiruv" → "tekshiruvdan
  o‘tish"; `xp.cap` "Kuniga {cap} gacha" → "Kuniga ko‘pi bilan {cap}"; headline "Qisqacha" /
  "sarlavha" made one term "qisqacha tavsif".
- (language) ru: «Скрыто из публичных рейтингов» / «Вы скрыты из…» → «Не показывать в публичных
  рейтингах» / «Вас не видно в…»; «действуют защиты» → «действует защита»; «Эта неделя» → «На
  этой неделе»; «Сериалы с новым эпизодом» → «Истории с продолжением…»; «Наблюдение не
  достучалось до Schood» → «Не удалось передать данные наблюдения в Schood»; «Одни сигналы никого
  не проваливают» → «Сами по себе сигналы не могут быть причиной провала»; «Ваше письмо» → «Ваш
  текст»; «Ваше на всю жизнь» → «Ваш на всю жизнь» (Skill Passport); league lead/result phrasing.
- (length) buttons over 24 characters at 375 px shortened: `settings.messagesOpen` en
  "Notification settings", uz "Bildirishnoma sozlamalari", ru «Настройки уведомлений»;
  `offer.never` uz "Takliflarni o‘chirish", ru «Больше не предлагать»; `journey.certificate` uz
  "Sertifikat imtihoni"; `path.already` uz "Buni qilib bo‘lganman"; `passport.import` uz
  "Schood’dan import qilish", ru «Добавить записи Schood». (`memory.open`, `cert.verifyPage` are
  text links that wrap; left.)
- (honesty) streak copy kept guilt-free and concrete: `streak.risk` uz/ru now "Bugun hali mashq
  qilinmadi…" / «Сегодня занятий ещё не было. Один короткий шаг сохранит серию.»; checked
  `buyNote`, `comeback.*`, `league.*`, `journey.atRisk`, `enough.*`: no threats, no fake urgency;
  under-18 wording (no streak purchases, hidden from public boards) consistent across keys.
### [VERIFY]
- `engage.memory.weakSpot` receives a raw skill key (`weak_spot` = e.g. `ielts.listening` from
  `remember.ts` / `progress.ts`), so the learner sees "most missed checks in ielts.listening".
  Code issue, not text: `Memory.tsx:65` should map it to a skill label. Not changed (out of scope).
- `engage.events.lead` "two tournaments a month": code runs a speaking and a sales tournament
  each month (`seasons.ts` `tournaments()`), so the text is right; flagging only that it implies
  both are open to everyone.
### Glossary proposals
- Skill Certificate(s): product name kept in Latin in eyebrows and "Check a Skill Certificate";
  descriptive title "Ko‘nikma sertifikatlari" / «Сертификаты навыков». Add to the product-names
  table so future texts follow one rule.
- Sitting (certificate exam attempt): uz "urinish", ru «попытка».
- Reviewer (certificate marker): uz "tekshiruvchi", ru «экзаменатор».
- Headline (Skill Passport / talent pool one-liner): uz "qisqacha tavsif", ru «Кратко о себе».

## Learner (learner/i18n/en.ts, uz.ts, ru.ts)
Counts: language 74 · fact 1 · answer 0 · consistency 38 · honesty 2 · placeholder 6
(13 en edits, 78 uz, 61 ru.)
### Changes
- (fact) `learner.consent.term3` (consent block marked "[VERIFY: owner review]") said "Student
  chats are deleted after 180 days unless you pin them". The core purge
  (`20261030130000_schood_ai_retention_and_erasure.sql`, `ai_purge_old_chats(180)`) deletes every
  message older than 180 days, pinned or not; only the shorter centre retention
  (`centre/admin.ts`, 30–180 days) skips pinned chats. Now en "Chats are deleted automatically
  after 180 days, or sooner if your centre sets a shorter period." / uz "Suhbatlar 180 kundan
  keyin avtomatik o‘chiriladi; markazingiz qisqaroq muddat belgilagan bo‘lsa, undan ham
  oldinroq." / ru «Чаты удаляются автоматически через 180 дней, а если ваш центр установил более
  короткий срок, то раньше.»
- (honesty) "the report has a cost": uz "pullik", ru «платный» → it costs credits: uz "hisobot
  uchun kredit yechiladi", ru «за отчёт в конце списываются кредиты» (`speak.mockFree`).
  Estimates labelled per glossary: uz `write.estimate` "Bu taxminiy mashq bahosi…", ru «Это
  примерная тренировочная оценка…»; `speak.band` uz "taxminiy ball (mashq bahosi)", ru
  «(примерный балл, тренировочная оценка)» (old «6.5 балл» did not agree with the number).
- (consistency) Feature names in the ты/sen form: uz `tool.explain` "Xatoimni tushuntir" (sen
  imperative, and "xatoim" is a misspelling) → "Xatoni tushuntirish"; ru «Объясни мою ошибку» →
  «Разбор ошибки»; ru «Скажите лучше» → «Как сказать лучше» (`speak.tips`, `speak.better`).
- (consistency) coach → коуч: ru «Тренер по письму» → «Коуч по письму», «Тренер произношения» →
  «Коуч по произношению». Study plan → «Учебный план». Feedback: uz "fikr" → "fikr-mulohaza"
  (6 keys), ru «отзыв» → «обратная связь» (7 keys). AI: uz "sun’iy intellekt" → "AI"
  (`consent.lead`, `consent.term1`). Essay ladder: ru '«Лестница» эссе' (`write.tab.ladder`,
  `write.ladderGo`). Cue card: uz "mavzu kartochkasi", ru «карточка с темой» (`speak.ieltsLead`).
- (consistency) Parent weekly brief: uz "haftalik hisobot" → "haftalik xulosa", ru «недельный
  отчёт» → «еженедельная сводка» (8 keys: `tool.family.lead`, `familyCard.lead`, `family.lead`,
  `noBrief`, `briefNow`, `weekly`, `parentSees`, `join.shares`), matching the glossary and the
  backend (`learner/family.ts`, `learner/jobs.ts`).
- (consistency) Uzbek suffixes on names, as the other catalogs do: "Schood AI dan/ni" → "Schood
  AI’dan/’ni", "Schooddagi/Schoodda" → "Schood’dagi/Schood’da", "@schoodstudentbot ga/da/ni" →
  "’ga/’da/’ni", "{name} dan" → "{name}dan"; "vebda" → "saytda".
- (language) Gendered ru forms in the learner’s own lines removed: `tutor.fromResults` «Я только
  что закончил занятие» → «У меня только что закончилось занятие в {app}.»; `consent.guardian`
  «…и согласен» → «…и не возражает»; `consent.needGuardian`, `family.consent`, `join.agree`
  («согласен» → «даю согласие»), `speak.skipPrep` «Я готов» → «Можно начинать».
- (language) en: `homework.pick` "Pick a homework on the left" (homework is uncountable; the list
  is not on the left on a phone) → "Choose a homework task from the list." (uz/ru likewise);
  `reading.go` "Write my text" (reads as if the learner writes) → "Write a text for me" (uz "Matn
  yaratish", ru «Создать текст»); `exam.admission` "Admission Maths" → "Admission maths" (sentence
  case); straight quotes → “ ” (`pronounce.heardAs`, `focus.th`, `abroad.lead`, `duel.ready`);
  "{seconds}s" → "{seconds} s".
- (language) uz: "Unchalik emas." (= "not very") → "To‘g‘ri emas."; "Yozib yuborish" (Type
  instead) → "Matn yozish"; "Bir ishora bering" (glossary: never "ishora") → "Kichik maslahat
  bering"; "Kirish matematikasi" → "Matematika (oliygohga kirish)"; "inshoyingiz" →
  "insholaringiz"; `consent.adult/teen/child` add "yosh"; `essays.status.ok` "Yaxshi" →
  "Qoniqarli"; `plan.yours`, `gap.headline*`, `tutor.fromResults`, `duel.lead`, `ladderNote`
  rephrased.
- (language) ru: «Помощник по домашке» → «Помощник с домашними заданиями»; «Напечатать» →
  «Ввести текстом»; «По существу» → «Соответствие вопросу»; «Ваш план {exam} до {target}» (broke
  with «Общий английский») → «Ваш план: {exam}, цель — {target}»; «Подтолкните меня» → «Дайте
  подсказку»; `consent.adult/teen/child` add «лет».
- (placeholder/plural) en `gap.headline` "in {days} days" and `family.stats` days/activities now
  plural; ru `family.stats` and `gap.headline` plural forms; minutes «{n} мин.» / uz "{n} daq."
  (`plan.minutes`, `family.stats`).
- (length) uz `write.modelGo` "Namuna javobni ko‘rish", `essays.go` "Hujjatni tekshirish",
  `speak.back` "Mashg‘ulotlarga qaytish", `plan.replan` "Natijaga qarab yangilash", `brief.now`
  "Bugungi mashqni olish"; ru `plan.replan` «Обновить по прогрессу».
- Study-abroad and visa: no visa facts are stated in the UI strings; `abroad.lead`,
  `abroad.rule`, `abroad.source` point to the dated, checked list and the official site. OK.
### [VERIFY]
- `learner.consent.term3`: product decision. If pinned chats are meant to survive the 180-day
  purge, `ai_purge_old_chats` must skip pinned threads and the text can mention pinning again.
  The owner-review block (`consent.*`, `family.consent`, `join.*`) also got language fixes; the
  owner should still read it.
- `learner.essays.kind.cover_letter` uz "Kuzatuv xati (cover letter)": glossary says "motivatsion
  xat [VERIFY against hh.uz]", but "Motivatsion xat" is already the next option (motivation
  letter) in the same list, so I kept "Kuzatuv xati". Needs a native HR check.
- `learner.tool.brief` and the brief screen: kept "Kunlik mashq" / «Ежедневная разминка» for the
  learner daily brief (L14) because the bot, notification labels and family brief text
  (`learner/brief.ts`, `jobs.ts`, `telegram.ts`, `family.ts`) all use it; the glossary row
  "Brief (parent, owner, daily) = xulosa / сводка" would make it "Kunlik xulosa", which does not
  fit a set of questions. See the glossary proposal.
- `learner.privacy.withdraw` (28/29/31 chars) is a small button that may wrap at 375 px; no
  shorter wording keeps the meaning.
### Glossary proposals
- Daily brief (learner, L14): uz "kunlik mashq", ru «ежедневная разминка» (what the bot and
  notifications already say); keep "xulosa / сводка" for parent and owner briefs only.
- Cover letter: uz "kuzatuv xati" (motivation letter stays "motivatsion xat"), to verify.
- Uzbek suffix on "Schood" and "Schood AI": always with ’ ("Schood’da", "Schood AI’dan"), as all
  catalogs now do; add it to the writing rules next to "Telegramda, IELTSga".

## Checks
- Validator (a local script): identical keys, identical placeholder names in en/uz/ru,
  plural forms complete (en one/other, ru one/few/many/other), braces, Uzbek apostrophes, no
  straight quotes in ru: 0 issues (engage pages 590 keys, learner 491 keys).
- Rendered samples through `packages/service-i18n` `format()` (1/3/11/21 for ru plurals): correct.
- `deno check --no-lock` on all 9 edited files: pass.
- `deno test --no-lock apps/schood-ai/tests/`: 1 passed, 0 failed.

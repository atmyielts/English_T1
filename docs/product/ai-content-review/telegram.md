# Telegram texts review

## Coach shared copy (`packages/coach-packs/src/copy.ts`; `bot-diagnostic.ts`, `report.ts`, `progress.ts`, `fluency.ts` have no localized strings of their own, they use copy keys)
Counts: language 34 · fact 2 · answer 0 · consistency 22 · honesty 3 · placeholder 0
### Changes
- `copy.ts:45` (language) `error.budget_exhausted` uz "Bu oygi" → "Bu oydagi"; ru «Попросите больше у центра…» → «Попросите ещё кредитов у центра…» (больше of what?).
- `copy.ts:52-54` (consistency) `paywall` uz "<b>{coach} obunasi</b>ga" → "<b>{coach} abonementi</b>ga", "AI fikr-mulohazali murabbiylik" → "AI fikr-mulohazasi bilan murabbiylik"; ru «<b>пропуск {coach}</b>» → «<b>абонемент «{coach}»</b>», «от AI» → «от ИИ» (glossary single-coach pass, AI = ИИ).
- `copy.ts:76` (consistency) `welcome` ru «без AI» → «без ИИ».
- `copy.ts:78` (language) `welcome.back` uz "Qaytganingiz bilan, {name}!" (calque) → "Yana xush kelibsiz, {name}!".
- `copy.ts:135` (consistency) `speak.better_title` ru «Скажи лучше» → «Как сказать лучше» (glossary; uz already «Yaxshiroq ayting»).
- Mock terms (consistency): ru running text «пробник» → «пробный экзамен» in `today.reason.weekly_mock`, `speak.mock_note`, `speak.mock_result` («Результат пробного экзамена Speaking»), `quiz.mock_intro`, `quiz.mock_score`; buttons keep «пробник» (`speak.mock`).
- Role-play/glossary terms (consistency): uz `speak.cue` "Savol kartasi" → "Mavzu kartochkasi", ru «Карточка» → «Карточка с темой»; uz "karta(lar)" → "kartochka(lar)" in `today.reason.due_cards`, `deck.intro`, `report.row.cards`; uz bare "to‘ldiruvchi(lar)" → "to‘ldiruvchi so‘zlar" in `speak.fluency`, `speak.fluency_typed`, `report.row.fillers_per_minute`, `report.row.fillers_per_100`; uz "Temp" → "Sur’at"; ru «Лестница эссе» → «"Лестница" эссе» (`write.ladder`); uz "Skript yaratish" → "Skript konstruktori", ru «Конструктор скрипта» → «Конструктор скриптов» (`script.question`); uz `sample.label` "o‘ylab topilgan o‘quvchi" → "to‘qima o‘quvchi"; ru «мини-приложении» → «Mini App» (`quiz.listen_in_app`, also «играет» → «воспроизводится»); uz `script.saved` "keyingi xabar paneldagi sahifada" → "follow-up xabari panelda".
- Estimates (honesty/consistency): ru «Ориентировочный уровень» → «Примерный уровень» (`diag.result`); «оценка {overall}» → «примерная оценка {overall}» (`speak.result`); `rp.review` «Оценка уровня» → «Примерный уровень».
- `cert.earned` (honesty) added in all three languages: "It is a Schood coach certificate, not an official exam result." (glossary honesty rule: coach certificates say so). ru «Вы достигли его за оценённых результатов: {count}» (broken) → «Для этого понадобилось оценённых результатов: {count}».
- `quiz.type_answer` / `quiz.over_limit` (language, en+ru) `wordLimit` can be 1 ("no more than 1 words", «Больше 1 слов»): en → "(word limit: {limit})", "That’s over the word limit ({limit}) — …"; ru → «(лимит слов: {limit})», «Слов больше лимита ({limit}) — на экзамене такой ответ засчитают как неверный».
- `deck.question_phrase` (language) the situation is an English fragment ("you meet a friend…"): en missing "?" → "What do you say when {situation}?"; uz "Qachon nima deysiz: {situation}" (ungrammatical) → "Nima deysiz? Vaziyat: {situation}"; ru «Что вы скажете, когда {situation}» (Russian conjunction + English clause) → «Что вы скажете? Ситуация: {situation}».
- `quiz.percentile` (language) uz "…{people} nafar o‘quvchisidan <b>{percentile}%</b> idan yuqorisiz" (double ablative, detached suffix) → "Natijangiz so‘nggi {days} kunda ushbu murabbiy bilan shug‘ullangan {people} nafar o‘quvchining <b>{percentile}%</b> qismidan yuqori." (keeps `<b>{percentile}%</b>`, which `coach/e2e-maths.test.ts` asserts).
- `rp.scorecard` (language) uz "{ratio}% ini" (detached suffix) → "{ratio}% qismini" (keeps the "%" that `coach/e2e-speaking.test.ts` asserts); "{questions} ta savol" → "{questions} ta savol berdingiz" (en "questions asked").
- Neutral (non-gendered) coach voice in ru (language): `not_now` «я этого не ждал» → «я этого не ожидаю»; `goal.date_bad` «Не понял дату» → «Не удалось разобрать дату»; `speak.timing.long` «поэтому я оценил то, что он услышит» (also mixed tense) → «Экзаменатор останавливает на 2:00, поэтому оценена только эта часть»; `write.ocr` «Вот что я прочитал» → «Вот что удалось прочитать».
- `write.ladder_note` (fact) ru «Образцы переписанного вами же эссе» (says the learner rewrote it) → «Образцовые версии вашего же эссе».
- ru agreement after placeholders (language): `error.too_long` «Уложитесь в {max} символов» → «Максимум символов: {max}»; `script.too_long` likewise; `speak.fluency_typed` «слов — {words}» → «слов: {words}»; `quiz.practice`, `quiz.mock_intro` «{minutes} мин» → «{minutes} мин.».
- Other language fixes: uz `speak.errors_title` "Buni tuzating" → "Bularni tuzating" ("these"); uz `speak.rerecord_prompt` "Avval va keyin natijani" → "Avvalgi va keyingi natijani"; uz `write.too_short` "qisqa javob ball yo‘qotadi" → "qisqa javob uchun ball pasayadi"; uz `drill.fresh_offer` "tayyorlaymi?" → "tayyorlab beraymi?"; uz `deck.intro` "{due} tasi takrorlash" → "{due} tasi takrorlash uchun"; uz `progress.errors` "Takrorlanuvchi:" → "Takrorlanuvchi xatolar:", ru «Повторяется:» → «Повторяющиеся ошибки:»; uz `help` "Har bir ball o‘z gaplaringizdan iqtibos keltiradi" → "Har bir baho o‘z so‘zlaringizdan iqtibos bilan asoslanadi", "Yangi daraja bilan ulashish mumkin bo‘lgan sertifikat beriladi" → "Har bir yangi daraja uchun ulashsa bo‘ladigan sertifikat beriladi"; ru `help` «Каждая оценка цитирует ваши слова» → «Каждая оценка подкреплена цитатами из ваших ответов»; ru `today.enough` «помогает закрепить —» → «помогает закрепить материал —»; ru `quiz.over_time` «(больше лимита)» → «(сверх лимита времени)»; ru `speak.mock_scoring` «Это конец теста… Оцениваю всё выступление» → «Тест по говорению окончен. Оцениваю все ваши ответы…»; ru `sh.sentence` «как вы говорите» → «как вы произносите»; ru `plan.title` «Сейчас этап:» → «Текущий этап:»; uz `rp.replay_title` "…bilan qayta" (unfinished) → "…bilan takror".
- Button lengths (aim ≤ 24): uz `onboard.test` "📝 Daraja testini topshirish" (27) → "📝 Daraja testini boshlash"; ru `onboard.skip_test` «Пропустить — знаю свой уровень» (30) → «Пропустить — знаю уровень»; `correction.gentle` / `correction.strict` buttons uz "Yumshoq — faqat ma’noga xalaqit beradigani" (42) → "Yumshoq — faqat ma’noni buzadigani", "Qat’iy — har bir xato, tushuntirish bilan" → "Qat’iy — har bir xato izohi bilan", ru «Мягкий — только то, что мешает понять» → «Мягкий — только мешающее пониманию», «Строгий — каждая ошибка с объяснением» → «Строгий — все ошибки с объяснением» (now as long as en).
- `script.practise` (length) button ru «🎭 Потренироваться с вашим клиентом» (35 chars) → «🎭 Тренировка с клиентом»; uz "🎭 O‘z mijozingiz bilan mashq" → "🎭 Mijozingiz bilan mashq".
### [VERIFY]
- `copy.ts:66` `link.confirm`: the bot tells the learner to press **Confirm / Tasdiqlash / Подтвердить** on the web linking page; I could not check that the web button carries exactly these labels.
- `copy.ts:297` `quiz.type_number` uz/ru examples "2,5, -3 yoki 3/4": confirm the number parser accepts a decimal comma (en shows 2.5).

## Coach bot workers and coach function (`workers/schood-coach-bots/src/*.ts`, `supabase/functions/schood-ai/coach/**`)
Counts: language 0 · fact 0 · answer 0 · consistency 3 · honesty 0 · placeholder 0
### Changes
- The worker and the coach flows render only `copy.ts` keys (plus pack content owned by the pack reviewers); no own strings except these:
- `coach/routes.ts:600-601` (consistency) session titles uz "Kartalarni takrorlash" → "Kartochkalarni takrorlash", "Takrorlab gapirish" → "Shadowing (takrorlash mashqi)" (glossary).
- `coach/mod.ts:23` (consistency) notification label ru «напоминания и недельные отчёты» → «…и еженедельные отчёты» (glossary weekly report).
### [VERIFY]
- `workers/schood-coach-bots/src/worker.ts:110` `link.failed` fills `{reason}` with the raw error code from telegram-link (e.g. "invalid", "expired"), so the learner reads an English code inside a uz/ru sentence. Code, not text: left for the lead.

## Student bot AI (`workers/schood-bot/src/schood-ai.ts`)
Counts: language 1 · fact 0 · answer 0 · consistency 0 · honesty 0 · placeholder 0
### Changes
- `schood-ai.ts:38` (language) uz `ʻ` → `‘` (bog‘lang, bog‘lash, ko‘ring); "urinib ko‘ring" → "qayta urinib ko‘ring". "Hisob → Telegramni bog‘lash" kept: it matches the platform's uz menu ("Hisob").

## Learner (`supabase/functions/schood-ai/learner/{telegram,brief,family,tutor,jobs}.ts`; others have no learner-facing localized text outside `data/`)
Counts: language 16 · fact 0 · answer 0 · consistency 6 · honesty 0 · placeholder 0
### Changes
- All uz strings: `ʻ` (U+02BB) → `‘` (U+2018) in `telegram.ts`, `brief.ts`, `family.ts`, `tutor.ts` (matching regexes in `common.ts`/`pronunciation.ts`/`homework.ts` untouched).
- uz suffix on a product name (language): "Schood AI ni / Schood AI da / Schood AI dagi" (detached suffix) → "Schood AI’ni / Schood AI’da / Schood AI’dagi" (`brief.ts`, `telegram.ts`, `tutor.ts`); "@schoodstudentbot ga" → "@schoodstudentbot botiga"; "ai.schood.online/family da" → "ai.schood.online/family sahifasida".
- `telegram.ts` en `children` example "How is she doing in English?" (assumes a girl) → "How is my child doing in English?"; ru «Как у неё дела…» → «Как у ребёнка дела…»; ru «Какой ребёнок?» → «О каком ребёнке речь?».
- Parent brief term (consistency, glossary brief = xulosa / сводка): `telegram.ts` uz "Haftalik hisobot: /child brief" → "Haftalik xulosa: …", ru «Недельный отчёт» → «Недельная сводка»; `family.ts` title uz "Haftalik hisobot" → "Haftalik xulosa", ru «Недельный отчёт» → «Недельная сводка»; `jobs.ts:22` notification label likewise (matches the UI: «недельную сводку»).
- `family.ts:227` (language) ru number agreement after a number written by code (`${minutes} ${label}`): «минут практики», «активных дней», «дней подряд» → «мин. практики», «дн. активности», «дн. подряд» (correct for 1, 2, 5, 21…); limit «Дневной лимит {limit} мин, достигнут в {days} дн.» → «Дневной лимит {limit} мин.; достигнут дней: {days}». uz limit "Kunlik chegara {limit} daqiqa, {days} kun yetib borildi" → "Kunlik limit {limit} daqiqa: {days} kun limitga yetildi". uz NO_DATA "faollik bo‘lmadi" → "hali faollik bo‘lmadi" (en "yet").
- `telegram.ts` uz other: ask "Har bir javob 1 kredit." → "Har bir javob narxi — 1 kredit."; consent "vebda" → "saytda"; capped "(Toshkent)" → "(Toshkent vaqti bilan) qayta urinib ko‘ring"; brief_on "{time} da yoqilgan" → "soat {time} da yoqildi"; duel_ready '"{topic}" ({level}) duelingiz' → '«{topic}» ({level}) mavzusidagi duelingiz'; quiet "vaqt tanlang" → "bo‘lgan vaqtni tanlang". ru capped «(Ташкент)» → «(по ташкентскому времени)»; failed «не смог ответить» → «сейчас не смог ответить» (en "just now").
- `brief.ts` uz wrong "Unchalik emas." ("not really") → "Unchalik to‘g‘ri emas." (en "Not quite.").
- `tutor.ts` uz suggestion "Bugun uchun 20 daqiqalik reja" (glossary: avoid "Bugun uchun") → "Bugungi kunga 20 daqiqalik reja"; context label uz "o‘qituvchingiz fikri" → "o‘qituvchingizning fikr-mulohazasi", ru «отзывы вашего учителя» → «обратная связь от вашего преподавателя» (glossary feedback, teacher).
### [VERIFY]
- `learner/telegram.ts:84` `brief_status` fills `{state}` with the raw word "off" in every language («Ежедневная разминка: off.», "Kunlik mashq: off."). Needs a code change (a localized off word); left for the lead.

## Centre (`supabase/functions/schood-ai/centre/{brief,messages,shared}.ts`)
Counts: language 2 · fact 0 · answer 0 · consistency 0 · honesty 0 · placeholder 0
### Changes
- `centre/brief.ts:98` (language) notification label ru «Понедельничная сводка центра» (awkward) → «Сводка по центру на понедельник»; uz "Markazingizning dushanba xulosasi" → "Markazingiz bo‘yicha dushanba xulosasi".
- `centre/messages.ts:120` (language) action summary ru «Связаться с ${lead_name}» (a name cannot take the instrumental case) → «Повторный контакт: ${lead_name}» (glossary follow-up).
- `shared.ts` month and weekday names and the date formats are correct in all three languages; the win-back, renewal and parent texts are model-drafted from English prompts (out of scope) and go out only after Approve & run.

## Engage (`supabase/functions/schood-ai/engage/content/messages.ts`, `engage/mod.ts`, `engage/samples.ts`)
Counts: language 12 · fact 0 · answer 0 · consistency 4 · honesty 0 · placeholder 0
### Changes
- Honesty: every reminder and win-back shows only the person's own numbers, no threat, no guilt, no countdown to an offer; `winback_21` says "This is the last reminder" (an honest statement that messages stop, not urgency). `event_mock` "open until Sunday 22:00" is the event's real window. No change needed.
- Mock terms (consistency): ru `engage.events` «Национальный пробный тест» → «…пробный экзамен»; `event_mock` text «национальный пробник» → «национальный пробный экзамен» (button «Пройти пробник» kept).
- Streak freeze (consistency, glossary "seriya muzlatish; {count} ta muzlatish"): `freeze_held` uz "{count} ta seriya muzlatgichi" → "{count} ta muzlatish"; en "You also hold {count} streak freeze(s), used automatically…" → "Streak freezes you hold: {count}. One is used automatically if you miss a day."; ru «У вас есть заморозки серии ({count}); они срабатывают сами, если пропустить день» → «Заморозок серии у вас: {count}. Если пропустите день, одна сработает автоматически».
- ru agreement after placeholders (language): `comeback_open` «ещё {left} занятия до {date}» (wrong for 1, 5…) → «выполните до {date} ещё занятий: {left}»; `winback_2` «{days} дней занятий», «{minutes} минут» → «дней занятий: {days}», «{minutes} мин.»; `checkin_soon` «{minutes} минут» → «{minutes} мин.»; `squad_nudge` «из {goal} минут» → «из {goal} мин.».
- uz (language): `checkin_soon` '"{title}" ({kind}) {when}.' (no predicate) → '«{title}» ({kind}) — {when}.'; `checkin_after` quotes → «»; `comeback_open` "yana {left} ta mashg‘ulot, va u tiklanadi" → "yana {left} ta mashg‘ulot bajarsangiz, u tiklanadi"; `winback_2` "Schood’da {xp} XP va {days} kunlik o‘qishingiz bor" → "Schoodda {xp} XP to‘pladingiz va {days} kun shug‘ullandingiz"; `winback_21` "Schood’dagi" → "Schooddagi" (glossary: no ’ where it does not help reading, as "Schoodda" elsewhere); `league_result` button "Bu haftalik liga" ("this weekly league") → "Bu haftaning ligasi"; `promoted` "siz yuqoriga ko‘tarilasiz" → "keyingi ligaga o‘tasiz".
- en `league_result` "you finished {rank} in the … league" ({rank} is a bare number: "finished 3") → "you finished #{rank} in the … league".
- ru `promoted` / `demoted` «вы поднимаетесь», «вы опускаетесь на одну лигу» → «вы переходите в лигу выше», «вы переходите на лигу ниже».
- `engage/mod.ts` context labels and `engage/samples.ts` (no localized learner text; the filler word list is a matching list) are fine.

## Core (`supabase/functions/schood-ai/core/assistant.ts`)
Counts: 0. Name, description and suggestions are correct in all three languages.

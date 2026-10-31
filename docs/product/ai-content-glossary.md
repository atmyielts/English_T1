# Schood AI: content glossary (en, uz, ru)

The terms every learner-facing text in Schood AI uses: the UI catalogs in `apps/schood-ai/src/*/i18n/`,
the coach packs in `packages/coach-packs/`, the engage stories and journeys, and the Telegram texts.
Use the form in this table. If a text needs a term that is not here, add it here first.

Review log: `ai-content-review.md`.

## Writing rules per language

- **Uzbek.** Latin script. `‘` (U+2018) in o‘ and g‘ (O‘, G‘); `’` (U+2019) for the tutuq belgisi
  (ta’lim, e’lon, sur’at), and before a suffix on a Latin-spelt foreign name only where it
  helps reading (Reading’dagi, Training’ga; but Telegramda, IELTSga). A suffix on an English answer
  option is attached with ’ (True’ni, Not Given’ga), never written as a separate word; the same for
  the brand (Schood’da, Schood AI’dan) and placeholders ({bot}’ni). Quotes are «…». Never `'`, `` ` ``, `ʻ` or `ʼ`. Address the learner as **siz**, with the verb in
  the polite plural (bosing, yozing, ko‘ring). Natural Tashkent usage over word-for-word
  translation: "Bugungi vazifa" rather than "Bugun uchun topshiriq".
- **Russian.** The coach and the interface address the learner as **вы** (lowercase), in every
  pack. Role-play personas may use **ты** only when the scene calls for it (a friend, a peer), and then
  consistently for that persona. Feature names are not in the ты form ("Как сказать лучше", not
  "Скажи лучше"). Use «ёлочки» for quotes. After a placeholder whose number cannot agree, write
  "кредиты: {count}" or use a plural form `{count|one:…|few:…|many:…|other:…}` where the catalog
  supports it. Minutes after a placeholder: «{minutes} мин.», never «{minutes} минут».
  Avoid gendered past-tense forms in learner-facing coach text ("вы ответили" is fine; in translations
  of a learner's own line prefer a neutral wording).
- **English.** British spelling (practise as a verb, centre, organisation, colour). Sentence case
  for buttons and headings.

## Product names (never translated)

| Term | en | uz | ru |
|---|---|---|---|
| The product | Schood AI | Schood AI | Schood AI |
| Learner plan | Schood AI Plus | Schood AI Plus | Schood AI Plus |
| Family plan | Plus Family | Plus Family | Plus Family |
| Teacher plans | Schood AI Teacher, Teacher Pro | same | same |
| Centre plans | Schood AI Centre, Centre Pro, Enterprise | same | same |
| Profile | Skill Passport | Skill Passport | Skill Passport |
| Telegram screens | Mini App | Mini App | Mini App |
| Teacher tools | Materials Studio, Live Quiz | same | same |
| Exam skills and tasks | Speaking, Writing, Reading, Listening, Task 1, Task 2 | same | same |
| Exam parts | Part 1 … Part 3 (Speaking), Part 1 … Part 4 (Listening) | 1-qism (1–3-qismlar) | часть 1 (части 1–3) |

"Passport" on its own is always "Skill Passport".

## Product terms

| Concept | en | uz | ru |
|---|---|---|---|
| AI (generic) | AI | AI | ИИ |
| Credit(s) | credit, credits | kredit, kreditlar (5 kredit) | кредит; 1 кредит, 2 кредита, 5 кредитов; "кредиты: {count}" |
| Abbreviated cost | {count} cr. | {count} kr. | кр.: {count} |
| Pricing plan | plan | tarif | тариф |
| Study plan | plan, study plan | reja, o‘quv reja | план, учебный план |
| Single-coach pass | {coach} pass | {coach} abonementi | абонемент «{coach}» |
| Top up | top up | hisobni to‘ldirish | пополнить баланс |
| Saved chats | chats | suhbatlar | чаты |
| Approve & run (button) | Approve & run | Tasdiqlash va bajarish | Подтвердить и выполнить |
| Coach (Telegram coach, pack) | coach | murabbiy | коуч (коучи, коучинг) |
| IELTS Coach (B1) | IELTS Coach | IELTS murabbiyi | IELTS-коуч |
| Tutor (L1) | tutor | repetitor | репетитор |
| Learner | learner | o‘quvchi | ученик |
| Teacher | teacher | o‘qituvchi (not "ustoz" in UI) | преподаватель (not «учитель» in UI) |
| Centre | centre, education centre | markaz, o‘quv markazi | центр, учебный центр |
| Parent | parent | ota-ona | родитель |
| Placement test | placement test | daraja testi (not "joylashtirish testi") | тест уровня (not «тест на уровень») |
| Trial lesson (centres) | trial lesson | sinov darsi | пробный урок |
| Account | account | akkaunt (Schood akkaunti); quote the platform's own menu label where a text points to it | аккаунт |
| Notification | notification | bildirishnoma | уведомление |
| Lead (centre admissions) | lead | ariza, potensial mijoz (not "lid") | заявка |
| Answer key | answer key | javob kaliti | ключ ответов |
| Rubric | rubric | mezonlar jadvali | критерии оценивания |
| Homework | homework | uy vazifasi | домашнее задание |
| Mock (exam) | mock, mock test | sinov imtihoni; short: sinov | пробный экзамен; short buttons: пробник |
| Mini-mock (B3) | mini-mock | mini-sinov | мини-пробник |
| Weekly report | weekly report | haftalik hisobot | еженедельный отчёт |
| Parent and owner brief | brief | xulosa (haftalik ota-ona xulosasi, rahbar xulosasi) | сводка (сводка для родителей, сводка для владельца) |
| Learner daily brief (L14) | daily brief | kunlik mashq | ежедневная разминка |
| Daily plan / today | today, today’s plan | bugungi reja | план на сегодня |
| Feedback | feedback | fikr-mulohaza | обратная связь |
| Role-play | role-play | rolli o‘yin | ролевая игра |
| Persona | persona, buyer | personaj, mijoz | персонаж, клиент |
| Drill | drill | mashq | упражнение |
| Lesson (micro-lesson) | lesson | dars | урок |
| Shadowing | shadowing | shadowing (takrorlash mashqi) | шэдоуинг |
| Phrase bank | phrase bank | iboralar to‘plami | банк фраз |
| Vocabulary deck | deck, cards | kartochkalar | карточки |
| Mistake notebook | mistake notebook | xatolar daftari | тетрадь ошибок |
| Essay ladder | essay ladder | insho zinapoyasi | «лестница» эссе |
| Script builder (B4) | script builder | skript konstruktori | конструктор скриптов |
| Objection | objection | e’tiroz | возражение |
| Next step | next step | keyingi qadam | следующий шаг |
| Band (IELTS) | band | ball | балл |
| Criterion | criterion | mezon | критерий |
| Level | level | daraja | уровень |
| Certificate | certificate | sertifikat (Schood sertifikati, not an official exam result) | сертификат |
| Skill Certificates (E12) | Skill Certificates | Skill Certificates; descriptive: ko‘nikma sertifikatlari | Skill Certificates; descriptive: сертификаты навыков |
| Dashboard | dashboard | panel | панель |
| Hint, tip | hint, tip | maslahat (not "ishora": in maths that is a sign) | подсказка, совет |
| Worked solution | solution | yechim | решение |
| Say it better (upgrade lines) | say it better | «Yaxshiroq ayting» | «Как сказать лучше» |
| Cue card (Speaking Part 2) | cue card | mavzu kartochkasi | карточка с темой |
| Estimated band / score | estimated band | taxminiy ball | примерный балл |
| Summary completion | summary completion | qisqacha mazmunni to‘ldirish | заполнение краткого содержания |
| Fictional (sample) learner | invented learner | to‘qima o‘quvchi | вымышленный ученик |
| Correction mode | correction mode | tuzatish rejimi | режим исправлений |
| Fluency | fluency | ravonlik | беглость |
| Signpost (in a talk) | signpost | o‘tish iborasi (not "ishora") | связка |
| Sentence stress | stress a word | mantiqiy urg‘u | логическое ударение, выделить голосом |
| Elevator pitch | elevator pitch | elevator pitch | elevator pitch, питч |
| Hostile question | hostile question | dushmanona savol | враждебный вопрос |
| Filler words | fillers | to‘ldiruvchi so‘zlar (never bare "to‘ldiruvchi": that is the grammar term for an object) | слова-паразиты (never bare «паразит») |
| Pace | pace | sur’at | темп |
| Airport gate | gate | chiqish eshigi | выход (на посадку) |
| Scholarship (award) | scholarship | grant | грант, стипендия (award) |
| Monthly stipend | stipend | stipendiya | стипендия |
| Student visa | student visa | talabalik vizasi (UK: Student vizasi) | студенческая виза |
| Practice figures | figures invented for practice | mashq uchun raqamlar | учебные цифры |

## Career and sales terms (B4, B5)

| Concept | en | uz | ru |
|---|---|---|---|
| Job interview | interview | suhbat | собеседование («интервью» only in running text) |
| Mock interview | mock interview | sinov suhbati | пробное собеседование |
| Interviewer | interviewer | suhbatdosh | интервьюер |
| Cover letter | cover letter | motivatsion xat [VERIFY against hh.uz] | сопроводительное письмо |
| Motivation letter | motivation letter | motivatsion xat | мотивационное письмо |
| CV summary block | summary | «O‘zim haqimda» bloki | блок «О себе» |
| STAR | STAR | S (vaziyat), T (vazifa), A (harakat), R (natija) | S (ситуация), T (задача), A (действие), R (результат) |
| Discovery | discovery | ehtiyojni aniqlash | выявление потребностей |
| Qualifying | qualifying | mijozni saralash | квалификация клиента |
| Value (benefit) | value | foyda | ценность |
| Closing | closing | bitim tuzish | закрытие сделки |
| Trade a concession | trade a concession | evaziga yon berish | уступка только в обмен |
| Acknowledge an objection | acknowledge | tushunganingizni bildiring (not "tan oling") | признать, показать, что поняли |
| Follow-up | follow-up | keyingi aloqa (follow-up) | повторный контакт (follow-up) |
| Trial (of a service) | trial | sinab ko‘rish, sinov muddati (never bare "sinov") | пробный период |
| Sample shipment | trial order | sinov partiyasi | пробная поставка |
| List price | list price | prayslistdagi narx | прайс |
| Decision maker | decision maker | qaror qiluvchi | тот, кто принимает решение (no ЛПР, КП in learner text) |
| Scorecard | scorecard | natija kartasi | карта результата |
| Phone greeting | Hello? | Allo | Алло |

## Engagement terms

| Concept | en | uz | ru |
|---|---|---|---|
| Streak | streak | seriya | серия |
| Streak freeze | streak freeze, freeze | seriya muzlatish; count: {count} ta muzlatish | заморозка серии; заморозки |
| XP | XP | XP | XP |
| Daily quests | daily quests | kunlik vazifalar | задания дня |
| Weekly challenge | weekly challenge | haftalik chellenj (not "sinov": that is a mock) | задача недели |
| League | league | liga | лига |
| Leaderboard | leaderboard | reyting | рейтинг |
| Squad | squad | jamoa | команда |
| Duel | duel | duel | дуэль |
| Journey | journey | dastur | программа |
| Journey name pattern | "<target>: a N-week programme", never "X → Y in N weeks" | "<maqsad>: N haftalik dastur" | «<цель>: программа на N недель» |
| Chapter (of a journey) | chapter | bob | глава |
| Graduation | graduation | bitiruv | выпуск |
| Story (story mode) | story | hikoya | история |
| Episode | episode | qism | эпизод |
| Lifetime path | lifetime path | umrbod yo‘l | путь на годы |
| Season | season | mavsum | сезон |
| Then vs now | then vs now | oldin va hozir | тогда и сейчас |
| Win-back | win-back | qaytarish | возврат |
| Talent pool | talent pool | iste’dodlar bazasi | кадровый резерв |

## Honesty rules (from `44_SCHOOD_AI.md`)

- No promised results ("you will get 7.0", "guaranteed"), no invented numbers or pass rates, no
  testimonials. Scores from a coach are **estimates** (uz "taxminiy", ru "примерная оценка").
- No fake urgency ("only today", "last chance", countdowns to an offer) and no guilt
  ("you are losing everything"). A win-back message may show real progress, never a threat.
- A sample is labelled as a sample (uz "namuna", ru "пример"), never a real person's result.
- Coach certificates are not official exam results; texts say so.

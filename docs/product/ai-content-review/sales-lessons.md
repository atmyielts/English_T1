# B4 Sales Coach: lessons, rubrics, writing, diagnostic, samples, calibration notes

## Sales lessons (`packages/coach-packs/sales/lessons.ts`)
Counts: language 98 · fact 1 · answer 0 · consistency 8 · honesty 4 · placeholder 0

All 15 check questions have exactly one right option and the key is right; explanations agree in en/uz/ru.

### Changes
- (honesty) Rules of thumb stated as universal fact softened to honest guidance:
  "The buyer decides in the first 20 seconds" → "often decides within the first 20 seconds" (uz "ko‘pincha … 20 soniyadayoq", ru "часто уже в первые 20 секунд");
  "I’ll think about it … usually hides" → "often hides" (uz "odatda … yashiradi" → "uning ortida ko‘pincha … turadi", ru "обычно" → "часто");
  "they will ask for more next time" → "may ask" (uz "so‘raydi" → "so‘rashi mumkin", ru "попросят" → "он может попросить");
  "DM buyers ask several shops at once" → "often ask" (uz, ru same).
- (fact/consistency) `lesson.qualifying` example: en "set money aside in March" contradicted uz/ru ("for March", "на март") → "for March".
- (consistency) `lesson.follow-up` title and check: uz "follow-up" / ru "follow-up" → skill-node names from the manifest: uz "Foyda keltiradigan keyingi aloqa (follow-up)", ru "Повторный контакт (follow-up), который приносит пользу"; check prompt uz "Qaysi keyingi aloqa eng zaif?", ru "Какой повторный контакт самый слабый?".
- (consistency) `lesson.qualifying` uz "Imkoniyat" (Means) clashed with the title "imkoniyat" (opportunity) → "Mablag‘".
- (language, uz) "trade a concession" was calqued as "almashing" (exchange) in 6 places (price title/body, negotiation body/why) → "evaziga yon bering", "faqat evaziga", "Har bir yon berish evaziga biror narsa oling", "chegirma o‘rniga taklif qilish mumkin".
- (language, ru) the same calque "меняйтесь" / "чем можно меняться" (4×) → "уступайте только в обмен", "только в обмен", "что можно дать / предложить в обмен".
- (language, uz) "Tan oling" (= admit/confess) for "Acknowledge" → "Tushunganingizni bildiring"; check prompt aligned.
- (language, uz) calques fixed, e.g. "Ko‘pincha nima noto‘g‘ri ketadi?" → "Ko‘pincha qanday muammolar chiqadi?"; "keyin joy bering" → "keyin xaridorga bemalol ko‘rishga imkon bering"; "savdoni bosimsiz tirik saqlaydi" → "davom ettiradi"; "Ikki-uchta nuqta yetarli" → "fikr"; "tashlab keting" → "olib tashlang"; "o‘zingizga qarshi taklif bermang" → "narxni o‘zingiz tushiravermang"; "O‘z-o‘zidan o‘rtasini bermang" → "Farqni o‘ylamasdan teng bo‘lishmang"; "bitta tez savol" → "bitta qisqa savol"; "Kartoshkangiz" → "Kartoshka fri"; "Har bir stol rejasiga … majlis xonalari" → "Har bir tarifga … muzokaralar xonasi" (glossary: tarif); bazaar bullet rewritten ("adolatli sabab bilan kichik adolatli yon bering … hech qachon tez katta tushirmang" → "asosli sabab bo‘lsa …, ozgina yon bering, lekin hech qachon narxni birdan ko‘p tushirmang").
- (language, uz) "tsikl" (old spelling) → "byudjet davri" (title, why).
- (language, uz) times: «Soat to‘rt qulaymi?» → «Soat to‘rtda qulayroqmi?»; «Payshanba soat 11 dami?» → «Payshanba kuni soat 11 da qulaymi?»; "kelishing" → "kelishib oling".
- (language, uz) quote+suffix «…»ga → «…» degan gapga; "Salom Gulnora," (missing comma, too casual for a hotel manager) → "Assalomu alaykum, Gulnora!"; DM: «DMda» → «narxi direktda» (what Uzbek shops actually write).
- (language, ru) "Выявление: открытые вопросы с глубиной" → "Выявление потребностей: глубокие открытые вопросы"; "И переходите к шагу" → "Затем переходите к следующему шагу"; "стоит ли им проблема денег" → "обходится ли им проблема в деньги"; "Делайте каждый стоящим ответа" → "Сделайте так, чтобы на каждый хотелось ответить"; "из двух времён" → "из двух вариантов времени"; "за недели" → "в течение нескольких недель"; "опоздание поставки" → "задержка поставки"; "дайте пространство" → "дайте покупателю осмотреться"; bazaar bullet "небольшой честный жест за честную причину" → "небольшая уступка за понятную причину"; "Сразу данная скидка … попросят больше" → "Скидка, данная сразу, … он может попросить больше".
- (language, ru) gendered past tense in seller lines (glossary rule) → neutral: "я правильно понял?" → "я правильно понимаю?"; "как обещал —" → "Как и договаривались, высылаю …".
- (language, en) shop-floor example "For a wedding, then this green adras…" → "If it’s for a wedding, this green adras…"; "("in DM")" → "("price in DM")".
- About 60 smaller wording fixes in uz/ru (missing subjects such as "Если клиент занят", "Почему именно он", "Mijoz tayyor bo‘lmasa", case/word-order fixes, "лучше" → "лучше всего" in "best" prompts).
- (language, ru) also: «Цена в директе» used in the lesson so it matches the placement option.

## Sales rubrics (`packages/coach-packs/sales/rubrics.ts`)
Counts: language 2 · fact 0 · answer 0 · consistency 0 · honesty 0 · placeholder 0

Descriptors are English only (assessor-facing). The scale is consistent (each step from 1 to 5 adds one observable behaviour) and honest. Criterion names agree in en/uz/ru.
### Changes
- `rubrics.ts:69` (language) closing focus "does they ask" → "do they ask".
- `rubrics.ts:90` (language) ru criterion name "Под этого клиента" (slangy) → "Соответствие клиенту".

## Sales writing tasks (`packages/coach-packs/sales/writing.ts`)
Counts: language 24 · fact 0 · answer 0 · consistency 3 · honesty 0 · placeholder 0

All 10 tasks are plausible Uzbek-market situations. The amounts (520 000, 6,8 mln, 9 mln, 900 000, 150 000 so‘m) are realistic and labelled as practice figures in all three languages.
### Changes
- (consistency) `w.dm-course` en "A 17-year-old writes" → "A 17-year-old boy writes" (uz "yigit", ru "парень" and the notes' "his goal" already say boy).
- (consistency) uz "B2B xaridorga" → "B2B mijozga" (glossary: buyer = mijoz); uz "majlis xonalari" → "muzokaralar xonalari" (2×, as in the lessons).
- (language, uz) quote+suffix titles: «narxi?»ga → «narxi?» savoliga; «Ma’lumot yuboring»dan keyin → «Ma’lumot yuboring» degandan keyin. The follow-up title is now "Qo‘ng‘iroqdan keyingi Telegram xabari (follow-up)". Other fixes: "tijorat yugurish yo‘lakchalari" (a calque of "commercial") → "professional …"; "kuryer yetkazishlarini" → "kuryerlik yetkazib berishlarini"; "omborida" (warehouse) for "depot" → "bazasida"; "1C da" → "1C’da"; "narxni … qotirib" → "o‘zgarmas qilib belgilab"; in the complaint task, "divan sotib oldi; u dushanba kuni keldi" (ambiguous: did she arrive?) → "lekin divan dushanba kuni yetkazildi"; the buyer quote "turlaringizni hammasini" → "barcha oilaviy yozgi turlaringizni".
- (language, ru) "попросила месячную цену" → "попросила назвать цену за месяц"; "коммерческих беговых дорожках" → "профессиональных … для своего клуба"; "о вашей уборке офисов" → "о ваших услугах по уборке офисов"; "Ниже себестоимости вы не можете" → "Опуститься ниже себестоимости вы не можете"; "масла" → "растительного масла"; "Вы нашли Telegram владельца" → "контакт в Telegram"; follow-up title → "Сообщение в Telegram после звонка (follow-up)".

## Sales placement (`packages/coach-packs/sales/diagnostic.ts`)
Counts: language 19 · fact 0 · answer 0 · consistency 3 · honesty 2 · placeholder 0

24 items (18 questions and 6 can-do statements), which matches the intro's "24 questions". Every question has exactly one right option, the key is right, and the levels make sense.
### Changes
- (honesty) intro "your first scored calls make it precise" → "more precise". The benefit example "so your kitchen never waits" was an absolute promise, against the lessons' own rule → "doesn’t have to wait" (uz "kutib qolmaydi", ru "вашей кухне не придётся ждать").
- (consistency) uz "Sun’iy intellekt yo‘q" → "AI ishlatilmaydi" (glossary: AI); «Narxi DMda» → «Narxi direktda»; x5 "Tan olish" → "Tushunganingizni bildirish" (as in the lesson).
- (language) en "why you call this person" → "why you are calling this person"; uz "hech narsa yozilmaydi" → "yozib olinmaydi". The n4 prompt calques in uz/ru ("yon berishni yaxshi almashtiradi", "хорошо меняет уступку") → "Qaysi jumlada yon berish evaziga to‘g‘ri shart qo‘yilgan?", "В какой фразе уступка грамотно дана в обмен?"; «Давайте поровну» → «Давайте разделим разницу пополам». Can-do in uz: "Ko‘pchilik suhbatlarni" → "Suhbatlarning ko‘pchiligini"; "Hech narsa evazisiz chegirma bermasdan muzokara olib boraman" → "Muzokarada evaziga hech narsa olmasdan chegirma bermayman"; "qaror qiluvchi" → "qaror qabul qiluvchi shaxs". In ru: "После выявления, что сделать перед презентацией?" → "Что сделать после выявления потребностей, перед презентацией?"; "конкретным шагом" → "конкретным следующим шагом"; plus similar small fixes.

## Sales samples (`packages/coach-packs/sales/samples.ts`)
Counts: language 28 · fact 2 · answer 2 · consistency 7 · honesty 0 · placeholder 0

All four samples are labelled as examples (Example / Namuna / Пример) and follow an invented learner. Learner quotes and evidence are unchanged.
### Changes
- (answer: sample score vs rubric) `sample.review-cold-call` closing 2 → 1.5. The quoted line "Write to me if you are interested." matches the sales.call level-1 descriptor ("call me if you need"). The note now says "Only a vague “write to me”, with no next step". Overall stays L2+ (mean 2.4, weighted 2.36 → 2.5).
- (answer: sample score vs rubric) `sample.dm-report` next_step 1 → 2. "Write if you want" matches the sales.message level-2 descriptor ("write if interested"), not level 1 ("no next step at all"). The note now starts "A vague ending: …". Overall stays 1.5 = L1+ (mean 1.7, weighted 1.67). Please revert both if numbers are off-limits for reviewers.
- (fact) The `sample.plan` preview said "a written follow-up twice a week", but the week has one follow-up (Saturday) and one Instagram reply (Wednesday) → "a writing task twice a week" (uz "yozma topshiriq", ru "письменное задание").
- (fact) The `sample.dm-report` preview said the better version gives "two real details", but it gives three (sizes, delivery, exchange) → "three" (uz "uchta", ru "три").
- (consistency) glossary fixes: uz "Uydirma o‘quvchi" → "To‘qima o‘quvchi"; uz "fikr" → "fikr-mulohaza" (feedback); ru "Тренажёр:" (drill) → "Упражнение:" (3×), and "Верных ответов в тренажёре" → "в упражнениях на возражения"; ru "Карта:" → "Карта результата:" (manifest term); uz "to‘ldiruvchilar" → "to‘ldiruvchi so‘zlar"; ru plan tasks "Письмо:" (= a letter) → "Письменное задание:" (2×).
- (language, uz) "so‘zlarning 58% ini" → "58 foizini"; «…»ni / «…»ga after quotes → "degan iltimosni / degan gapga / degan savolga" (6×). "Keyingi qadam:" was used for "Fix next", which clashes with the sales term → "Endi ustida ishlash kerak:". Also: "namunaviy yetkazish" → "namuna yetkazib berish"; «Payshanba soat 11 dami?» → «Payshanba kuni soat 11 da qulaymi?»; in the corrected DM, "Salom!" → "Assalomu alaykum!" and "Qaysi o‘lcham kiyasiz?" → "Qaysi o‘lchamni kiyasiz?"; "fitnes klubda" → "fitnes-klubda"; "joy qidirayotgan" → "ofis qidirayotgan".
- (language, ru) "могла быть острее" → "могла бы быть конкретнее"; "Хороший открытый вопрос, нашёл проблему…" → "…выявил проблему…, но не было уточнения…"; "Чтобы прислать полезное" → "Чтобы прислать то, что вам пригодится"; "нашего толстого реза" → "нашего картофеля толстой нарезки"; "Фокус на неделю" → "на следующую неделю"; "Звонков с датированным шагом" → "со следующим шагом и датой".
- (language, en) "So I send what is useful" → "So that I send something useful"; "and you judge" → "and you can judge for yourself"; the row label "Objection drills right" → "Objection drills correct".

## Sales calibration notes (`calibration-call.ts`, `calibration-message.ts`; rationale only)
Counts: language 4 · fact 0 · answer 0 · consistency 0 · honesty 0 · placeholder 0
### Changes
- `c02` rationale: this is a showroom visit, so "the call ends" → "the conversation ends".
- `c07` rationale: "A concrete trial day for the whole team with a day is proposed." → "A concrete next step is proposed: a free trial day for the whole team next Tuesday."
- `c12` rationale: "confirmed by the buyer" (only the learner's lines exist) → "checked with the buyer ("Is that fair?")".
- `m09` rationale: the garbled "The value could quantify less" → "The value could be more concrete".

### [VERIFY]
- `calibration-message.ts` m12 (L5, all criteria 5): the learner adds a client story ("Two of our clubs in Yunusabad … no breakdowns this season") that task w.reengage does not give. Meanwhile the `writing.ts` w.reengage notes list "invented statistics or testimonials" as weak, and the rubric says "never reward invented facts". I may not change learner text or references; the owner should decide whether the top reference should reward this.
- `rubrics.ts`: the two rubrics rate the same move differently. sales.call closing level 1 = "call me if you need"; sales.message next_step level 2 = "write if interested". Consider harmonising them. Related: the `calibration-call.ts` c03 closing reference is 1.5 for "звоните, если что", which is the level-1 example; left as is.
- `lessons.ts` shop-floor example: "A dress takes about four metres" of adras/atlas. This depends on the fabric width (traditional narrow khan-atlas needs more). Check with a fabric seller.
- `manifest.ts` (not my file): `weak_opening.explain` still states as fact "The first 20 seconds decide whether the buyer keeps listening". I softened the same claim in the lesson to "often"; the manifest reviewer may want to match it.

### Glossary proposals
- follow-up: uz "keyingi aloqa (follow-up)", ru "повторный контакт (follow-up)" (the manifest's skill-node names). Today some texts use a bare "follow-up".
- trade a concession: uz "evaziga yon berish", ru "уступка только в обмен". Avoid the calques "almashish" / "меняться".
- acknowledge (an objection): uz "tushunganingizni bildiring" (not "tan oling", which means "admit"), ru "признайте".
- "price in DM": uz «narxi direktda», ru «цена в директе» (what shops actually write).
- meeting room: uz "muzokaralar xonasi", ru "переговорная".

### Checks
- `deno run --no-lock --allow-read packages/coach-packs/scripts/check.ts sales`: ✓ (72 activities, 2 rubrics, 24 diagnostic items).
- `deno run --no-lock --allow-read packages/coach-packs/scripts/calibration.ts sales`: ✓ sales.call exact 0.911, QWK 0.993; sales.message exact 0.922, QWK 0.994.
- `deno test --no-lock packages/coach-packs/test/`: 22 passed, 0 failed.

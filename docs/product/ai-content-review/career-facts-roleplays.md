# Review log: B5 Career facts, interview, role-plays + learner abroad/speaking data

Reviewer: career-facts-roleplays. Sources re-read with WebFetch on 2026-10-31.

## Learner study-abroad data (supabase/functions/schood-ai/learner/data/abroad.ts)
Counts: language 7 · fact 4 · answer 0 · consistency 4 · honesty 0 · placeholder 0
### Changes
- whole file (consistency): 35 × `ʻ` (U+02BB) → `‘` (U+2018) in o‘/g‘, Uzbek strings only (every hit checked to follow o/O/g/G; en/ru untouched).
- `abroad.ts:29` uk.visa.who (fact, uz): "16 yoshdan katta" means *older than 16* (excludes 16) → "16 yosh va undan katta". "qo‘shimcha ta’lim" (= supplementary/after-school education) is wrong for UK *further education* → "kollej (further education)". "litsenziyali homiy-o‘quv yurti" → "litsenziyaga ega talaba homiysi (o‘quv yurti)", the wording career/facts.ts uses.
- `abroad.ts:30` uk.visa.who (language, ru): calque "курс дальнейшего образования" → "в колледже (further education) или в вузе"; "получили предложение места от лицензированного учебного спонсора" → "лицензированный спонсор (учебное заведение) предложил вам место на курсе" (same as career/facts.ts).
- `abroad.ts:38` uk.visa.when (fact, uz): "6 oy oldin ariza berish mumkin" lost "at the earliest" → "ko‘pi bilan 6 oy oldin ariza berishingiz mumkin".
- `abroad.ts:55-57` uk.english.level (fact, en/uz/ru): "universities may ask for higher scores" is NOT on gov.uk/student-visa/knowledge-of-english (checked 2026-10-31) but was shown as a verified fact → replaced by advice "Also check the English requirements of your university." (uz/ru the same). Also made "it must still be B2" say "for degree level or above" in uz/ru, as the source and the en do.
- `abroad.ts:70,79,88` us.i20 / us.sevis / us.entry (consistency + language, uz): "Form I-20 ning", "Form I-20 da" → "I-20 shakli(ning/da)", as career/facts.ts writes it; "F va M talabalar" → "F va M toifali talabalar"; "30 kungacha oldin" → "ko‘pi bilan 30 kun oldin". ru us.i20: "F и M" → "категорий F и M", "с сертификатом SEVP" → "с сертификацией SEVP" (= career/facts.ts).
- `abroad.ts:95,100,115` (language, uz): "ballini" → "talab qilinadigan ballni"; "Talaba vizasiga onlayn (DS-160) ariza beriladi" → "Talabalik vizasi uchun onlayn DS-160 anketasi to‘ldiriladi"; "daraja uchun o‘qiydigan" (calque) → "ilmiy daraja yoki diplom olish uchun o‘qiydigan".
- `abroad.ts:126-128` tr.burslari (fact, en/uz/ru): turkiyeburslari.gov.tr/en lists the support as "Language Course" (no "Turkish language course" on the cited page) → "a language course" / "til kursi" / "языковой курс". uz "yotoqxona" (dormitory) → "turar joy" (accommodation); "magistr … darajalarini" → "magistratura … dasturlarini". ru "а также распределение в университет" → "кроме того, стипендия обеспечивает зачисление в университет" (source: "ensures university placement").
- Verified unchanged on 2026-10-31: uk.visa.fee (£558, gov.uk), uk.visa.when (6 months), us.i20, us.sevis, us.entry (studyinthestates I-20 page: "mandatory and must be paid before you enter the United States", "up to 30 days before the start date"), tr.burslari degree levels and placement. `checked` dates and ABROAD_DATA_VERSION left at 2026-10-30.
### [VERIFY]
- `abroad.ts` us.ds160 (checked: null): travel.state.gov answers 403 to automated fetches (again on 2026-10-31). Stays unverified.
- `abroad.ts` de.visa (null): auswaertiges-amt.de/en/visa-service is a hub page; it does not state the national-visa rule. A deeper page (Visa Navigator / "visabestimmungen") would be the right source.
- `abroad.ts` de.money (null): study-in-germany.de refused the connection (ECONNREFUSED) on 2026-10-31.
- `abroad.ts` kr.visa, kr.gks (null): studyinkorea.go.kr home page mentions GKS but not D-2/D-4; a deeper page is needed.
- `abroad.ts` uk.money.living (null): gov.uk/student-visa/money confirms the figures (£1,529 / £1,171 a month, up to 9 months; 28 days, 31 days) but I left it unchecked because `learner.test.ts:215` asserts it is an unverified entry. If the lead wants it verified, enrich it with the career/facts.ts figures and update the test.

## Learner speaking data (supabase/functions/schood-ai/learner/data/speaking.ts)
Counts: language 10 · fact 0 · answer 0 · consistency 1 · honesty 0 · placeholder 0
### Changes
- whole file (consistency): 17 × `ʻ` (U+02BB) → `‘` (U+2018), Uzbek strings only.
- `speaking.ts:28` uk_visa title (language, uz/ru): "Buyuk Britaniya talabalik suhbati" / "Собеседование студента для вуза Великобритании" lost "credibility" and the ru was awkward → "Buyuk Britaniya universiteti: ishonchlilik suhbati" / "Собеседование в британский вуз: проверка намерений".
- `speaking.ts:29` situation (language, uz/ru): "haqiqiy talaba ekaningizni" / "что вы настоящий студент" (sounds like "a real, not fake, student") → "rostdan ham o‘qish uchun borayotganingizni" / "что вы действительно едете учиться" (the meaning of "genuine student").
- `speaking.ts:37` phrase (language): uz "Bu kurs meni … bilan qiziqtirdi" (unnatural) → "Bu kursning meni o‘ziga tortgan tomoni — …"; ru "Меня привлёк этот курс тем, что…" → "Этот курс привлёк меня тем, что…".
- `speaking.ts:46,51` (language, uz): "fanga qanday qarashingizni" → "fan haqida qanday fikrlashingizni" ("how you think about your subject"); "savolni mulohaza bilan yeching" → "savol ustida mulohaza yuriting".
- `speaking.ts:69` giveback (language, uz/ru): "Qanday qilib hissa qo‘shishingizni" (hissa to what?) → "Jamiyatga qanday hissa qo‘shishingizni"; ru "как вы отплатите обществу" (sounds like repaying a debt) → "какой вклад вы внесёте в общество".
- `speaking.ts:86` (language, uz): "O‘ylangan savol bering" → "Puxta o‘ylangan savol bering".
- `speaking.ts:147,159,163` pronunciation sentences (language, en): three C1 sentences were odd or illogical English. "…the method works, though it is rather thorough" → "…the method works, though nobody has tested it thoroughly"; "The analysis was analytical, but…" (tautology) → "Her analysis was careful and analytical, but her conclusion was controversial"; "The caught cat thought the court was cold" → "In autumn I thought the cat had caught a cold" (same /ɔː/–/æ/–/əʊ/ contrasts). Ids, levels and focus unchanged; no test uses the texts.
### Notes (outside my scope)
- `supabase/functions/_shared/english-roleplay.ts:61` (the US visa scenario reused here): uz "Xodim safaringiz haqida tez-tez savol beradi" means "asks often", not "asks quick questions" → "tezkor savollar beradi"; the file also uses `ʻ`. Owner of `_shared` should fix.

## B5 Career facts (packages/coach-packs/career/facts.ts)
Counts: language 6 · fact 3 · answer 0 · consistency 1 · honesty 0 · placeholder 0
Every statement of all nine datasets was re-read on its cited page on 2026-10-31 (gov.uk student-visa, /money, /knowledge-of-english, /documents-you-must-provide, /tb-test-visa, TB countries, IHS /how-much-pay; studyinthestates I-20 page and the 27 July 2026 first-arrival post; ice.gov/sevis/i901). All figures still match: £558, £1,529 / £1,171 a month for up to 9 months, 28 days / 31 days, 12 months, B2 / B1, £776 / £1,035, $350, 30 days, 6 months, 1 week / 1 month. `CHECKED` left at 2026-10-30 (the lead may bump it to 2026-10-31: the whole set was re-verified, see corrections below).
### Changes
- `facts.ts:251-253` uk-tb-test `who` (fact, en/uz/ru): gov.uk/tb-test-visa lists THREE conditions; the third ("you were living there (or another listed country) within the last 6 months") was missing → added in all three languages.
- `facts.ts:160-161` uk `arrival` (fact, uz/ru): uz dropped "up to" ("1 hafta oldin … 1 oy oldin" read as exact) → "ko‘pi bilan 1 hafta / ko‘pi bilan 1 oy oldin"; "hech qachon emas" (elliptical) → "kelish mumkin emas". ru: the second limit lacked "не раньше чем" → added; "но никогда раньше даты" → "но в любом случае не раньше даты".
- `facts.ts:91` `fee_separate` (fact, ru): "не связан ни с визовыми сборами…" (= "is unrelated to") → "оплачивается отдельно от визовых сборов…" (source: "separate from").
- `facts.ts:43,51` (language, uz): "(DSO) dan" → "(DSO)dan"; "I-20 ning asl nusxasini olib kelish kutiladi" → "I-20 shaklining asl nusxasini olib borishingiz kutiladi".
- `facts.ts:67-68` `i20_at_entry` (language, uz/ru): "chegarada Bojxona va chegara xizmati xodimi" → "kirish punktida AQSh Bojxona va chegara himoyasi xizmati (CBP) xodimi"; ru "Таможенно-пограничной службы" → "Службы таможни и охраны границ США (CBP)".
- `facts.ts:106` title (language, uz): "birinchi kelish" → "birinchi marta kirish".
- `facts.ts:175` living costs (language, uz): "London kurslarida" → "Londondagi kurslarda", "(ko‘pi bilan 9 oy)" → "(ko‘pi bilan 9 oy uchun)".
- `facts.ts:276` (language, uz): "Ichki ishlar vazirligi (Home Office)" → "Buyuk Britaniya Ichki ishlar vazirligi (Home Office)" so it is not read as Uzbekistan's ministry.
- `facts.ts:11` code comment: noted travel.state.gov still 403 on 2026-10-31.
### [VERIFY]
- The six left-out US/UK items in the header comment remain unverifiable (travel.state.gov 403; no gov.uk page states UK credibility interviews or translation rules). No persona or goal in roleplays.ts states any of them; personas send the learner to the official site.
- abroad.ts and facts.ts now agree on every overlapping statement (UK who/when/fee/English; US I-20, SEVIS, 30-day entry).

## B5 Career interview questions (packages/coach-packs/career/interview.ts)
Counts: language 31 · fact 0 · answer 0 · consistency 2 · honesty 0 · placeholder 0
English questions are correct and natural; no model answers in this file; no honesty problems (no promised offers or statistics).
### Changes
- `interview.ts:31-125` (language, ru): 9 × cue-card topic "Представьтесь на позицию …" (HR calque) → "Представьтесь как кандидат на позицию …".
- `interview.ts:71` (language + consistency): ru "в FMCG-дистрибуции" → "в FMCG-дистрибьюторской компании"; uz "distributorida" → "distribyutorida" (line 101 spells "Distribyutorlik").
- `interview.ts:111` (language, uz/ru): "Bitiruvchi kurs talabasi … bitiruvchilar dasturiga" → "So‘nggi kurs talabasi … bitiruvchilar uchun stajyorlik dasturiga"; ru "на программу для выпускников" → "претендующий на программу стажировки для выпускников".
- `interview.ts:181` (language, uz): "xatoingiz" (wrong possessive after a vowel) → "xatongiz".
- `interview.ts:149` (language, uz): "Qanday ish paytida vaqt qanday o‘tganini" (two "qanday") → "Qaysi ish bilan band bo‘lganingizda vaqt qanday o‘tganini".
- `interview.ts:162` (language, uz): "kutilmalaringiz" (not a word) → "Qancha maosh kutyapsiz?".
- `interview.ts:155,184` (consistency, ru): "отзыв" for feedback → "обратная связь" (glossary).
- `interview.ts:195` (language, en/uz/ru): "How did you decide?" (decide what?) → "How did you decide what to do first?"; uz/ru matched.
- `interview.ts:264` (consistency, en/uz/ru): part title "one-minute pitch" contradicted the intro and timer (1 min prep, ~1.5 min talk, 90 s) → "short pitch" / "qisqa pitch" / "короткий питч".
- Other wording (language): ru "руководителю-нефинансисту" → "руководителю без финансового образования"; "отслеживаете отправки" → "грузы"; "людьми совершенно разного происхождения" → "из совсем разной среды"; "Пройдитесь по своему резюме" (calque) → "За две минуты расскажите о своём резюме по порядку"; "Расскажите о работе в очень сжатые сроки" → "о случае, когда вам пришлось работать…"; "всё пошло не так одновременно" → "всё сразу пошло не так"; "Как вы делаете так, чтобы ваш код было легко…" → "Как вы добиваетесь того, чтобы другим было легко поддерживать ваш код?"; "Расскажите, как вам пришлось изменить решение" → "о случае, когда…"; "Что вы делаете с учеником" → "Как вы работаете с учеником". uz "Kampaniya ishlamayotgan/ishlayotganini" → "natija bermayotgan/berayotganini"; "Rezyumengizni … tushuntirib bering" → "rezyumengizni boshidan oxirigacha so‘zlab bering"; "muvozanatlashtirasiz" → "uyg‘unlashtirasiz"; "solishtirma dalolatnoma" → "hisob-kitob solishtiruvi"; "oldinga borayotganini" → "rivojlanayotganini"; "uning bandi yo‘qolgan" (bandi = busy/clause) → "uning broni topilmayapti"; "Xona darajasini oshirishni" → "Yuqoriroq toifadagi xonani"; intro "bir daqiqa, keyin … chamasi" → "bir daqiqa beriladi, keyin bir yarim daqiqacha".

## B5 Career role-plays (packages/coach-packs/career/roleplays.ts)
Counts: language 52 · fact 0 · answer 0 · consistency 3 · honesty 0 · placeholder 0
Checked all 17 role-plays: hidden-state fields, initial values and rules agree (e.g. salary-it-offer offer 9 → budget_max 10.5 in 0.5 steps vs the learner's minimum 10; salary-hotel 7 → 8.5); every salary is labelled a practice figure; every visa persona states facts only from facts.ts, never announces a decision, and sends the learner to the official site; the US personas' "after study / return plan" probes state no rule. Personas, names (Malika, Shoira opa, Gulchehra opa, Farhod aka, Akmal Rustamovich…), cities and employers are plausible for Uzbekistan and suit school-age learners. Coach text uses вы/siz throughout.
### Changes
- `roleplays.ts:60` EXAMPLE goal (language, uz): "Da’voni … isbotlang" (da’vo also = lawsuit) → "Aytganingizni real misol va natija bilan isbotlang" (goal shown in several role-plays).
- `roleplays.ts:188,413,441` (language, uz): calque "javobni qisqa … saqlang" (3×) → "javobingiz qisqa va amaliy bo‘lsin" / "Javoblaringiz qisqa, rost va izchil bo‘lsin".
- `roleplays.ts:89,110,195,503` titles (language, uz): "IT kompaniyada" → "IT kompaniyasida … QA mutaxassisi"; "chakana tarmoq do‘kon supervayzeri" → "chakana savdo tarmog‘ida do‘kon supervayzeri"; "telekom bitiruvchilar dasturi" → "telekomda bitiruvchilar dasturi"; "Stipendiya paneli" → "Stipendiya komissiyasi" (and "uch kishilik panel" → "komissiya"; ru already "комиссия").
- `roleplays.ts:361` title (language, ru): "Переговоры о всём пакете" → "обо всём пакете".
- `roleplays.ts:203,212` (language, ru): "в команде, у которой не получалось" → "которая испытывала трудности"; "чем это кончилось" → "закончилось".
- `roleplays.ts:262` demo-lesson setting (consistency, uz/ru): en "…and answers your questions" was missing in uz/ru → added.
- `roleplays.ts:313` opening (language, uz): "Salom, HR dan Shahzoda, yaxshi xabar bilan:" (broken) → "Salom, men HR bo‘limidan Shahzodaman, sizga yaxshi xabarim bor:".
- `roleplays.ts:362,369` (language, uz): "almashinuvchi smenalar" (2×) → "smenali jadval"; ru "супервайзера ресепшен" → "супервайзера службы приёма"; en "You need two weeks' notice at your current job" → "You must give two weeks' notice…" (the uz/ru already said the learner must give/serve notice).
- `roleplays.ts:363` (language, ru): "ему нужны более поздний выход и помощь" (agreement) → "более поздняя дата выхода и помощь".
- `roleplays.ts:392` (consistency + language): uz "konsul xodimi" → "konsullik xodimi" (= persona name); ru "здесь ничего не является реальным решением" → "ничто здесь не является настоящим решением".
- `roleplays.ts:438,440,523` (language, uz): calques "Darajadan keyin(gi)" → "Magistraturadan keyingi aniq rejangizni ayting" / "O‘qishdan keyin vatanda ishlash…"; "Ish tajribangiz orqali nega hozir ekanini" → "Ish tajribangizga tayanib, nega aynan hozir o‘qimoqchi ekaningizni".
- English (language): "around Tashkent region" → "around the Tashkent region"; "for Samarkand and Bukhara regions" → "for the Samarkand and Bukhara regions"; "for shift supervisor in the back office" → "for the shift supervisor role…"; "Fergana valley" → "Fergana Valley"; "before holidays" → "before the holidays".
- Other Russian: "Рекрутер звонит на десятиминутный скрининг перед приглашением…" → "Прежде чем пригласить кандидатов в отделение, рекрутер звонит вам для десятиминутного предварительного разговора"; "баг, который вы нашли и описали" → "…и оформили в баг-репорт"; "в подсобке" → "в служебном офисе"; "администраторов ресепшен" → "на ресепшен"; "вы учитесь на туризме" → "вы изучаете туризм"; "уровень языков" → "уровень владения языками"; "региональным HR" → "руководителем HR по региону"; "ответьте про фальсификацию" → "ответьте на вопрос о фальсификации"; "первичка" (jargon) → "первичная документация"; "два ученика в конце класса" → "на задних партах"; "пользу принесёте дома" → "на родине"; "заставила вас захотеть изучать" → "побудила вас изучать".
- Other Uzbek: "QA ni tanladingiz" → "QA yo‘nalishini tanladingiz"; "Topgan va xabar bergan haqiqiy xatongizni" → "O‘zingiz topib, xabar bergan haqiqiy xatoni (bug)"; "Lavozimsiz ham" → "Rasmiy lavozimingiz bo‘lmasa ham"; "biroz ingliz tilini biladigan" → "ingliz tilini biroz biladigan"; "smena tartibiga halol javob bering" → "smena jadvali bo‘yicha halol kelishib oling"; "jamoat bilan ishlash" → "jamoatchilik bilan ishlash"; Sara's opening (an unfinished "…boshlasangiz") → "Assalomu alaykum, … Avval … biror trening haqida gapirib bersangiz"; "Aniq hisob yuritish va hisobot berishni ko‘rsating" → "Qanday aniq hisob yuritishingiz va hisobot berishingizni ko‘rsating"; "bitiruvchi kurs talabasi" → "so‘nggi kurs talabasi"; "solishtirma ishlarini yuritgan" → "hisob-kitoblarni solishtirgan"; "Real ish haqida" → "Amaliy ish haqida"; "Noto‘g‘ri yozuvni" → "Noto‘g‘ri buxgalteriya yozuvini (provodkani) muloyim, lekin qat’iy"; "ko‘rsatkichli tuzilgan reja" (2×) → "ko‘rsatkichlari bor tuzilmali reja"; "Shartlarni yozma ravishda yoki qaror sanasini kelishing" → "Shartlarni yozma tasdiqlating yoki qaror sanasini kelishib oling"; "o‘zingiz yuritib boshladingiz" → "o‘z zimmangizga oldingiz"; "Natijalar bilan dalillang" → "Talabingizni natijalar bilan asoslang"; "Yozma aniq kelishuv" → "Aniq yozma kelishuv"; "Butun shartlar" → "Barcha shartlar"; learnerRole word order (samarqandlik); "vataningizda qiladigan ta’siringizni" → "vataningizga keltiradigan foydangizni".

## Totals
language 106 · fact 7 · answer 0 · consistency 11 · honesty 0 · placeholder 0 (plus 52 × ʻ → ‘ in the two learner data files, counted once per file under consistency).

## Glossary proposals
- **Scholarship**: the files mix uz "grant" (speaking.ts "Grant komissiyasi", abroad.ts "Turkiya granti") and "stipendiya" (career "Stipendiya komissiyasi"). Propose: scholarship (the award) = uz **grant**, ru **стипендия**; monthly allowance = uz **stipendiya**, ru **ежемесячная стипендия**. Then rename career's "Stipendiya komissiyasi" → "Grant komissiyasi" in one pass.
- **UK Student visa** (route name): en "Student visa", uz "Student vizasi (talabalik vizasi)", ru "Student visa (студенческая виза)"; generic "student visa": uz "talabalik vizasi", ru "студенческая виза". (Avoid "talaba vizasi".)
- **Credibility interview**: uz "ishonchlilik suhbati", ru "собеседование на проверку намерений".
- **Practice figures** (invented numbers in role-plays): uz "mashq uchun raqamlar", ru "учебные цифры".

## Tests run (worktree root, 2026-10-31)
- `deno run --no-lock --allow-read packages/coach-packs/scripts/check.ts career` → ✓ career 1.0.0, 59 activities.
- `deno run --no-lock --allow-read packages/coach-packs/scripts/calibration.ts career` → ✓ career.interview, career.cv, career.letter (exit 0).
- `deno test --no-lock packages/coach-packs/test/` → 22 passed, 0 failed.
- `deno test --no-lock supabase/functions/schood-ai/learner/` → 25 passed, 0 failed.
- `deno test --no-lock supabase/functions/schood-ai/coach/` → 32 passed, 0 failed.
- `deno check --no-lock` on abroad.ts, speaking.ts, career/index.ts → ok.

# Review log: B5 Career and Interview (writing, rubrics, samples, diagnostic, calibration)

## B5 manifest (`packages/coach-packs/career/manifest.ts`; `index.ts` has no learner text)
Counts: language 17 · fact 0 · answer 0 · consistency 8 · honesty 1 · placeholder 0
### Changes
- `manifest.ts:24-26` (honesty, language) tagline "A CV that gets calls" promised a result → "A stronger CV, interviews you can rehearse by voice, and a step-by-step plan towards the job you want." uz "Qo‘ng‘iroq keltiradigan rezyume … kerakli ishgacha reja" → "Kuchliroq rezyume, … kerakli ish sari bosqichma-bosqich reja."; ru "Резюме, на которое откликаются … план до нужной работы" (employers do not «откликаться» on a CV; «план до работы» is a calque) → "Более сильное резюме, … пошаговый план поиска нужной работы." Lengths now 102/97/97 (≤ 120).
- `manifest.ts:30-31` (language) uz "iqtibos keltirilgan baholangan hisobot" → "baholar va o‘z javoblaringizdan iqtiboslar bilan hisobot"; uz "rejasi oldinga yetaklaydi" (calque) → "rejasi to‘xtab qolmaslikka yordam beradi"; ru "оценённый отчёт" (= a report that was graded) → "отчёт с оценками и цитатами из ваших ответов". Description lengths 395/473/467 (≤ 512).
- `manifest.ts:38-40` (consistency) audience "study visa / o‘qish vizasi / учебная виза" → glossary "student visa / talabalik vizasi / студенческая виза".
- `manifest.ts:68-70` (language) duties tag: uz told the learner to "start with the action verb", impossible in verb-final Uzbek → "aniq harakat fe’li va natijani yozing («…orqali oyni yopish muddatini 6 kundan 4 kunga qisqartirdim»)"; ru example «Сократила…» was gendered coach text → «Сократил(а) срок закрытия месяца…».
- `manifest.ts:77-79` (language) ru "(помогал, улучшил, много)" gendered → «помощь», «улучшение», «много»; ru "за который вы отвечаете" (wrong sense) → "за который вы можете поручиться"; uz "ishonchli aniq natija" → "o‘zingiz tasdiqlay oladigan aniq natija" (= "you can stand behind").
- `manifest.ts:88` (language) ru "затем одна-две детали — и остановитесь" (no verb) → "затем приведите одну-две детали и остановитесь".
- `manifest.ts:95-97` (language, consistency) STAR tag: uz/ru capitalised mid-sentence words that do not spell STAR → "vaziyat (Situation), vazifangiz (Task), qilgan harakatlaringiz (Action; faqat «biz» emas, «men» deng) va natija (Result)" and the ru equivalent; ru "Закончите тем, чем всё кончилось" → "В конце скажите, чем всё закончилось…".
- `manifest.ts:115,124` (language) ru "заставляет интервьюера думать, что вы скажете о нём самом" → "…задуматься, что вы потом скажете о нём самом"; "подходящих к этой роли" → "подходящих для этой роли".
- `manifest.ts:129-133` (consistency, language) en tag name "Accepting the first offer without a reason" did not match uz/ru ("without discussion") → "…without discussion"; uz "(… o‘z izlanishingiz)" → "(… bozor bo‘yicha o‘z izlanishingiz)", "yozma oling" → "yozma ravishda oling"; ru "ваши собственные данные" → "ваше собственное исследование рынка" (= "your own research").
- `manifest.ts:138-142` (language) uz name "Rezyumedagi xatolar" → "Rezyumedagi imlo xatolari" (typos); ru "Одна опечатка может закончить чтение" (calque) → "Из-за одной опечатки резюме могут отложить."
- `manifest.ts:147-151` (language, consistency) ru "на визовом интервью" → "на визовом собеседовании"; uz "sizdek eshitiladi" / ru "звучат как вы" (calque of "sound like you") → "samimiy eshitiladi, yodlangan nutq esa sun’iy tuyuladi" / "звучат естественно".
- Menu (consistency, glossary): role-play label uz "Rolli suhbatlar" → "Rolli o‘yinlar", ru "Ролевые собеседования" → "Ролевые игры"; ru weekly report "Отчёт за неделю" → glossary "Еженедельный отчёт"; ru "Тренировка интервью" → "Тренировка собеседования" (24), "Полное пробное интервью" → "Пробное собеседование" (21): the pack's skill names use «собеседование».
- Commands (language, consistency): ru mock "…пробное интервью с отчётом" → "…пробное собеседование с отчётом"; ru role-play "HR, панель, зарплата и виза — ролевые игры" → "Ролевые игры: HR, панель, зарплата, виза"; uz report "Shu haftalik hisobot" → "Shu hafta hisoboti", ru "Отчёт за эту неделю".
### [VERIFY]
- none.

## B5 writing tasks (`packages/coach-packs/career/writing.ts`)
Counts: language 22 · fact 0 · answer 0 · consistency 3 · honesty 0 · placeholder 0
Situations (Samarkand appliance store, bank internship, Tashkent CSM posting, logistics thank-you, UZS counter-offer) are plausible and labelled as practice; no invented CV "rules" or statistics found. Assessor notes are accurate (past tense for past roles, achievements over duties, no invented figures).
### Changes
- `writing.ts:24-25` (language) w.cv-rewrite: uz "rekruter qo‘ng‘iroq qilishni xohlashi" → "rekruter sizga qo‘ng‘iroq…"; ru "чтобы рекрутеру на вакансию «…» захотелось позвонить" → "чтобы рекрутеру, который закрывает вакансию «…», захотелось вам позвонить"; ru practice facts "обучил…; вёл…" (masculine) → "обучение 2 новых консультантов; ведение Instagram-сторис…" (neutral, matches the other nominal facts). The weak "before" CV is left as written (it is the point).
- `writing.ts:34-35` (language) w.cv-student: uz "ko‘ngillilik yoki…" → "ko‘ngillilik faoliyatingiz yoki…"; ru "Если удобнее учебные данные: студент 3 курса экономики" → "Если удобнее работать с учебными данными: студент 3 курса экономического факультета".
- `writing.ts:41,44` (consistency, language) w.cv-career-change: uz "rezyume xulosasi" (xulosa reads as "conclusion" and is the glossary word for a brief) → "«O‘zim haqimda» bloki", matching ru «О себе» and the hh.uz task; uz "call-markazdan QA ga" (detached suffix) → "call-markazdan testlash (QA) sohasiga".
- `writing.ts:54-55` (language) w.cv-bullets: uz "ofis jihozlari" (= equipment) → "kanselyariya tovarlari" (office supplies), "direktor taqvimini yuritdim" → "direktorning ish jadvalini yuritdim"; ru coach text «отвечал за…», «работал с…» → «отвечал(а) за…», «работал(а) с…»; "пишите [число]" → "напишите [число]".
- `writing.ts:64-65` (language) w.linkedin-about: uz "Professional sifatda kimligingizdan… dalilli ikki-uchta yutuq" → "Kasbiy jihatdan kim ekaningizdan… ikki-uchta yutuqni dalillar bilan"; ru "кто вы профессионально" → "кто вы как специалист", stray comma before "или" removed.
- `writing.ts:74` (language) w.hh-profile uz: "8–12 ta asosiy ko‘nikmalar" (-lar after a number) and a sentence that put the vacancy after a dash → "Siz qidiradigan aniq vakansiya nomini tanlang va avval uni yozing. So‘ng hh.uz’dagi rezyumengiz uchun … 8–12 ta asosiy ko‘nikma ro‘yxatini yozing."
- `writing.ts:85` (language) w.cover-letter ru: "продаёт онлайн-запись" (sells appointments) → "продаёт сервис онлайн-записи"; "ясная коммуникация на узбекском и русском" → "умение ясно общаться на узбекском и русском".
- `writing.ts:94-95` (language) w.motivation-internship: uz "Qachon ishlay olishingiz bilan yakunlang" → "Qachondan ish boshlay olishingizni aytib, xatni yakunlang"; ru "правда хочется" → "действительно хочется".
- `writing.ts:104-105` (language, consistency) w.thank-you: uz "eng katta muammo ertalabki yetkazib berishlar kechikishi" → "eng katta muammo — ertalabki yetkazib berishlarning kechikishi"; ru "(своё настоящее или учебное: интервью на координатора логистики…)" (no verb) → "(возьмите своё настоящее собеседование или учебное: собеседование на должность координатора по логистике…)".
- `writing.ts:114-115` (language) w.follow-up: uz "Kim ekaningiz va qaysi lavozim ekanini eslating… (tugatgan sertifikatingiz" → "Kim ekaningizni va qaysi lavozimga ariza berganingizni eslating… (yangi olgan sertifikatingiz"; ru "законченный сертификат… дату выхода" → "полученный сертификат… дату, с которой готовы выйти".
- `writing.ts:124` (language) w.counter-offer uz: "oyning 1-sanasidan ish" (no verb) → "ish oyning 1-sanasidan boshlanadi"; "qanday tasdiqlashni taklif qiling" → "kelishuvni qanday rasmiylashtirishni taklif qiling".

## B5 rubrics (`packages/coach-packs/career/rubrics.ts`)
Counts: language 6 · fact 0 · answer 0 · consistency 1 · honesty 0 · placeholder 0
Descriptors (English) are clear, in Schood's own words, and progress consistently from 1 to 5 in every criterion; no changes needed there.
### Changes
- `rubrics.ts:46` (language) uz "Dalil va natijalar" → "Dalillar va natijalar".
- `rubrics.ts:58` (language) clarity focus comma splice → colon.
- `rubrics.ts:68` (language) uz "Professional til" → "Professional nutq" (spoken interview criterion; matches ru «Профессиональная речь»).
- `rubrics.ts:90` (language) "Impact" was calqued: uz "Ta’sir", ru "Влияние" (= influence) → uz "Natijadorlik (yutuqlar, natijalar)", ru "Результативность (достижения, итоги)".
- `rubrics.ts:112,123` (language) uz "Tuzilma va o‘qilishi" → "Tuzilma va o‘qishga qulaylik"; "Til to‘g‘riligi va izchillik" → "Savodxonlik va bir xillik" (matches ru «Грамотность и единообразие»).
- `rubrics.ts:145` (consistency) uz "Lavozim va o‘quvchiga mosligi": glossary o‘quvchi = learner, so it read "fit to the learner" → "Lavozim va xat oluvchiga mosligi".

## B5 samples (`packages/coach-packs/career/samples.ts`)
Counts: language 14 · fact 2 · answer 0 · consistency 12 · honesty 1 · placeholder 0
Scores checked against the rubric weights: interview sample criteria give 3.48 → 3.5 (L3+) ✓; CV sample 2.45 → 2.5 (L2+) ✓; weekly rows match the preview ✓. No visa or legal statements in the samples.
### Changes
- `samples.ts:16-18` (fact) preview said "118 words a minute with 4 fillers" but the metric is `fillersPerMinute: 4` → "118 words and 4 fillers a minute" (uz "daqiqasiga 118 so‘z va 4 ta to‘ldiruvchi so‘zni qayd etdi", ru "насчитал 118 слов и 4 слова-паразита в минуту"); uz "qayta yozish" (rewrite) → "qayta yozib olish" (re-record).
- (consistency, glossary) fictional learner: uz "o‘ylab topilgan" ×5 → "to‘qima o‘quvchi" / "to‘qima bitiruvchi"; ru "(вымышленная/вымышленный)" ×3 → "(вымышленная ученица / вымышленный ученик)"; ru "недельный отчёт" → "еженедельный отчёт"; ru "интервью" → "собеседование" ×3 (plan preview, plan day, weekly focus/preview); uz "(mashq raqamlari)" ×2 → glossary "(mashq uchun raqamlar)"; uz/en hh.uz day task "About me" put in quotes; ru "«О себе» и навыки" → "«О себе» и ключевые навыки" (en says key skills).
- `samples.ts:27` (language) clarity note ru "с небольшим количеством паразитов" → "слов-паразитов немного"; uz "biroz to‘ldiruvchilar bilan" → "to‘ldiruvchi so‘zlar kam".
- `samples.ts:32` (honesty, language) the "better" line invents an outcome for Malika (20 minutes, a savings account); kept as an illustration but the why now says so: "A specific outcome proves the skill. Use what really happened." (uz "Haqiqatda nima bo‘lganini ayting.", ru "Называйте то, что было на самом деле."); uz "fikr-mulohaza shaklida … omonat hisobi ochdi" → "fikr-mulohaza anketasida … omonat ochdi".
- `samples.ts:41-42` (language) uz "iqtibos qildi" → "iqtibos keltirdi"; ru "на его же фактах" → "на основе его же фактов"; ru why "на его собственных цифрах" → "с его собственными цифрами".
- `samples.ts:53` (fact, language) uz correction "bo‘sh qatnovlarni taxminan beshdan birga qisqartirdim" (reads as "cut to a fifth") → "…rejalashtirib, bo‘sh qatnovlarni taxminan beshdan bir qismga kamaytirdim" (= by about a fifth, as in en/ru).
- `samples.ts:63-64` (language) uz "muzokara qildi" → "muzokara olib bordi", "HR ga" (detached suffix) → "HR menejeriga"; ru "забыла попросить письменные условия" → "…условия в письменном виде"; ru "Скоркард: отработано 1 из 1 возражений, … и лучшие фразы для повтора" (jargon, case error) → "В карточке оценки: отработано возражений — 1 из 1, следующий шаг не закреплён; есть более удачные фразы для повторной попытки."
- `samples.ts:67` (language) uz scenario "boshlovchi QA taklifi" → "junior QA lavozimiga taklif".
- `samples.ts:72` (language) uz goal "Shartlarni yozma ravishda yoki qaror sanasini kelishing" (broken coordination) → "Shartlarni yozma ravishda kelishing yoki qaror sanasini belgilang".
- `samples.ts:90-91` (language) uz plan preview "kuniga 20 daqiqa bilan L4 ga intilayotgan" → "kuniga 20 daqiqa shug‘ullanib, L4 darajasiga intilayotgan"; ru "субботнее пробное интервью" → "пробное собеседование в субботу".
- `samples.ts:99` (language) uz "Dars: beriladigan savollar" (= questions you will be asked) → "Dars: suhbatdoshga beriladigan savollar".
- `samples.ts:110-111` (language) weekly preview had no verb for two of three items: uz → "suhbat javoblari L3 dan L3+ gacha ko‘tarildi, daqiqasiga to‘ldiruvchi so‘zlar 6 tadan 4 taga kamaydi, rezyume L2+ dan L3+ gacha o‘sdi"; ru → "ответы на собеседовании выросли с L3 до L3+, слов-паразитов в минуту стало меньше (с 6 до 4), резюме — с L2+ до L3+". Row labels uz "Daqiqadagi to‘ldiruvchilar/so‘zlar" → "To‘ldiruvchi so‘zlar (daqiqasiga)" / "So‘zlar (daqiqasiga)".

## B5 placement test (`packages/coach-packs/career/diagnostic.ts`)
Counts: language 26 · fact 0 · answer 0 · consistency 4 · honesty 0 · placeholder 0
All 18 keys checked: one right option per question, distractors clearly wrong, levels sensible (L2–L5). Counts in the intro (18 questions, 6 statements) match. vs2 ("official government site") agrees with facts.ts, which uses only official pages.
### Changes
- `diagnostic.ts:17-18` (language, consistency) uz "AI yo‘q" → "AI ishlatilmaydi"; ru "Без AI" → glossary "Без ИИ"; ru "проверка:" → "проверка вашего уровня:" (en "check of where you are").
- `diagnostic.ts:24` cv1 (language) uz "2024 yilda" → "2024-yilda", "Savdoda yaxshiman" (calque) → "Sotuvda kuchliman"; ru "Продал на 15% выше плана в 2024" → "…больше плана в 2024 году", "Хорош в продажах" (calque) → "Хорошо умею продавать".
- `diagnostic.ts:26` cv3 (language, consistency) uz "Bank va mehmonxonaga topshiryapsiz" → "…rezyume yuboryapsiz"; ru "Вы подаётесь в банк и в отель" (colloquial) → "Вы откликаетесь на вакансии в банке и в отеле"; uz option "Xulosa" → "«O‘zim haqimda» bloki" (matches ru «О себе»).
- `diagnostic.ts:29` hr1 (language) uz "Hozir professional sifatda nima qilishingiz" → "Hozir kasbingiz bo‘yicha nima bilan shug‘ullanayotganingiz"; "Maosh kutilmalaringiz" → "Kutayotgan maoshingiz".
- `diagnostic.ts:30-31` hr2/hr3 (language) uz "ko‘proq mas’uliyatga tayyorman, … aynan shuni beradi" → "Mijozlar bilan ishlashda ko‘proq mas’uliyat olishga tayyorman, bu lavozim aynan shu imkoniyatni beradi"; ru "к большей ответственности за клиентов" → "взять на себя больше ответственности в работе с клиентами"; hr3 uz "birinchi bo‘lib rejalashtiraman" (en: do them first thing) → "har kuni ertalab ularni birinchi navbatda bajaraman"; ru "ставлю их первыми каждое утро" → "каждое утро делаю их первыми".
- `diagnostic.ts:32` hr4 (language) uz "Ish uchun … yozuvga … bir daqiqada" → "Ish suhbatida … yozuvlarga … taxminan bir daqiqada" (en "about a minute").
- `diagnostic.ts:35` st1 (consistency) "What does the R in STAR stand for?" had uz/ru options Sabab/Natija/Rol — no letter R in uz/ru, so the question did not work; ru options were also accusative fragments ("Причину") → options "Reason (sabab)", "Result (natija)", "Role (rol)" and ru equivalents; prompts "STAR usulidagi R harfi…", "Что означает буква R в STAR?". Key unchanged (1).
- `diagnostic.ts:36` st2 (language) uz "sababini qadoqlashda topdim, joyini o‘zgartirdim" (whose place?) → "sababi qadoqlashda ekanini aniqladim, qadoqlash stolini boshqa joyga ko‘chirdim"; ru "перенёс стол" → "перенёс упаковочный стол".
- `diagnostic.ts:37-39` st3/st4/st5 (language) ru "Как её подать?" (wrong referent) → "Как о нём рассказать?"; uz option quoted «Hammasini o‘zim qildim» deyish; uz "yozma tasdiqlayman" → "yozma ravishda tasdiqlayman"; ru "Какое окончание" → "Какая концовка"; uz "qisqa muddat" (deadline) → "tig‘iz muddat".
- `diagnostic.ts:42-43` ng2/ng3 (language) uz "Qayta ko‘rib chiqish sanasi, boshlash sanasi, o‘qish…" → "Maoshni qayta ko‘rib chiqish sanasi, ishni boshlash sanasi, o‘qitish…"; ru "…обучение и другие части пакета" → "…или другие…" (en "or"); uz "yozma kelisha olaman" → "yozma ravishda rasmiylashtira olaman".
- `diagnostic.ts:47` js3 (language) en "needs the dealer network work I have done for three years" → "needs the dealer-network experience I have built over three years"; uz "sizning viloyatlarga kengayishingizga men uch yil qilgan … tajribasi kerak" (broken) → "kompaniyangizning viloyatlarga kengayishi uchun men uch yildan beri to‘playotgan … tajribasi kerak bo‘ladi"; ru "вашему выходу в регионы нужна работа с дилерской сетью, которой я занимаюсь" → "для вашего выхода в регионы нужен опыт работы с дилерской сетью, который я нарабатываю уже три года".
- `diagnostic.ts:50-51` vs1/vs2 (language) ru "вопросов визового интервью" → "вопросов на визовом собеседовании"; ru option "Как можно меньше слов, хоть одним" (case mismatch) → "Как можно короче, хоть одним словом"; uz "hatto bitta" → "hatto bitta so‘z bilan"; uz "hujjat qoidalari" → "hujjatlarga oid talablar"; ru "правила по документам и сборы перед подачей" → "Где перед подачей проверить требования к документам и сборы?"
- Left unchanged on purpose: masculine/feminine past tense inside candidate model lines (ru «Продал», «Я многому научился», «я нашёл»): they are a candidate's own words; Russian has no neutral past.

## B5 calibration (`calibration-cv.ts`, `calibration-interview.ts`, `calibration-letter.ts`, `calibration-kit.ts`): rationale only
Counts: language 0 · fact 3 · answer 0 · consistency 2 · honesty 0 · placeholder 0
Learner text, tasks and evidence untouched. Rationales checked against each response and its reference scores; calibration-letter.ts and calibration-kit.ts needed no change.
### Changes
- `calibration-cv.ts:18` (fact) c01 rationale claimed "dates in different formats"; the text has one date ("2023 dan beri") and a second vague line → "A run-on line of duties with no shop name or clear dates, then a vague line about earlier market work; first person, no punctuation, nothing achieved."
- `calibration-cv.ts:29` (fact) c02 rationale said "language is correct but generic" while the accuracy reference is 2 (frequent errors / inconsistent style) → "the Russian is correct, but the style is informal and uneven for a CV ("HTML немного", "люблю компьютеры с детства", "интернет" as a skill)", which is what justifies 2.
- `calibration-cv.ts:41` (consistency) c03 rationale now names the mixed bullet forms (Responsible…, Preparing…, Working…) behind accuracy 2.5.
- `calibration-interview.ts:20` (fact) i01 "L1 throughout" but clarity and language are 1.5 → "L1 overall".
- `calibration-interview.ts:59` (consistency) i04 rationale gave the candidate a gender the text does not ("hides her role") → "hides what the candidate did".

### [VERIFY]
- `writing.ts`, `samples.ts:100`, `diagnostic.ts:47` (and `lessons.ts:65`, not mine): uz uses "motivatsion xat" for BOTH a cover letter (ru «сопроводительное письмо») and a motivation letter, while the manifest skill is "Motivatsion va ilova xatlar". I left it because it is consistent across the pack and common usage; please confirm the term the Uzbek hh.uz interface uses for «Сопроводительное письмо» (ilova xat / qo‘shimcha xat?) and add it to the glossary.
- `writing.ts:41,44,71-74`, `diagnostic.ts:26`, `samples.ts:98`: the uz hh.uz field name «O‘zim haqimda» is assumed (ru «О себе» is the real hh field name). Confirm the label in the Uzbek hh.uz interface.
- `plan.ts:105` (another reviewer's file) still says «Полное пробное интервью»; to match the manifest it should be «пробное собеседование».

### Glossary proposals
- Job interview: en interview · uz suhbat (ish suhbati) · ru собеседование (not «интервью»; «интервьюер» is fine). Mock interview: sinov suhbati · пробное собеседование. Visa interview: viza suhbati · визовое собеседование.
- CV: rezyume · резюме. CV summary / "About me" block: «O‘zim haqimda» bloki · блок «О себе» (not "xulosa", which the glossary uses for a brief).
- Cover letter / motivation letter: decide the uz pair (see [VERIFY]); ru сопроводительное письмо / мотивационное письмо.
- Action verb (CV): harakat fe’li · глагол действия; note for uz that the verb comes last ("start with an action verb" does not translate literally).
- Uzbek suffixes after digits and level labels ("L3 dan", "40 dan"): the packs write them detached; the glossary should say whether that is the house style or whether to rephrase ("L3 darajasidan").

## Checks run
- `deno run --no-lock --allow-read packages/coach-packs/scripts/check.ts career` ✓ (59 activities, 3 rubrics, 24 diagnostic items)
- `deno run --no-lock --allow-read packages/coach-packs/scripts/calibration.ts career` ✓ (interview, cv, letter all pass thresholds)
- `deno test --no-lock packages/coach-packs/test/` ✓ 22 passed, 0 failed

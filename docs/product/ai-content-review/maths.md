## B3 Admission Maths (`packages/coach-packs/maths/*`: manifest, bank, bank-numbers, bank-algebra, bank-functions, bank-applied, bank-geometry, diagnostic, drills, lessons, writing, rubrics, samples, plan, calibration)

Counts (per item; a uz+ru pair fixed together counts once): language ~60 · fact ~42 · answer 3 · consistency 20 · honesty 3 · placeholder 5

Every learner-facing line was read against the answer test (`test/maths-answers.test.ts`). No answer key, option, option order, id or structure changed; every key the test computes still matches the wording. Calibration learner text and evidence quotes were not touched; their rationales are correct and were left as they are. Line counts are unchanged (153 lines edited, 153 removed), CRLF kept.

### Changes

**Answer (3)**
- `lessons.ts` lesson.motion-work check (answer). The question did not say where the time is counted from: «Через сколько часов велосипедист его догонит?» / "Velosipedchi necha soatda yetib oladi?". Counted from the pedestrian's start, the distractor **4** is also right. It now reads "…yo‘lga chiqqanidan necha soat keyin…" / «Через сколько часов после своего старта…». The explanation now shows the 4·3 = 12 km gap and the 16 − 4 closing speed.
- `bank-geometry.ts` triangles q7 (answer). The solution ended on "= 57" but the key is √57. It now reads "c² = 49 + 64 − 2·7·8·1/2 = 57, c = √57" (uz/ru).
- `bank-numbers.ts` natural q6 hint (answer). The only hint gave away the pair 18 and 24, which leaves one multiplication. It now says "a = 6m, b = 6n, m va n o‘zaro tub; EKUK = 6mn" / «a = 6m, b = 6n, m и n взаимно просты; НОК = 6mn».

**Honesty (3)**
- `manifest.ts` tagline and description (uz): "kutilayotgan natija" (the awaited result) → "taxminiy natija" (glossary: coach scores are estimates).
- `plan.ts` daily[0]: "imtihonga eng ishonchli yo‘l" / «самый надёжный путь к экзамену» → "imtihonga tayyorlanishning ishonchli yo‘li" / «надёжный способ подготовиться к экзамену». The "most reliable" superlative cannot be backed up.
- `bank.ts` single_choice strategy: "wrong options are made of exactly these errors" → "often" (ko‘pincha / часто).

**Placeholder / plural (5)**
- `plan.ts` ru daily reminders: `{minutes}` is the day's plan total (any number, e.g. 21, 24), so «{minutes} минут» breaks agreement (21 минута, 24 минуты). Changed to «{minutes} мин.» in all 5 strings. The uz «{minutes} daqiqa» is fine.

**Fact / problem statement (~42)**
- `bank-functions.ts`: 11 progression prompts did not name the progression type ("2; 5; 8; … progressiyaning…", "a₁ = 5, d = 3…", "b₂ = 6, b₅ = 48…", «В бесконечно убывающей прогрессии»). They now say "arifmetik / geometrik progressiyada", «в арифметической / геометрической прогрессии».
- `bank-applied.ts`:
  - word q2: the start points were missing (the cars now leave the two cities).
  - q4: the unit for the current's speed was missing (km/soat, км/ч).
  - q5: "solutions of the same substance".
  - q7: "average speed over the whole route".
  - q9: "empties the full pool".
  - statistics q4: uz described variance as "the square of the standard deviation" and ru as «средний квадрат отклонения». Both now say "the mean of the squared deviations from the mean", which also rules out the sample variance.
  - statistics q5: the explanation now defines the range.
- `bank-geometry.ts` quadrilaterals q3: the unit "(gradusda) / (в градусах)" was missing; the options are bare numbers.
- `bank-numbers.ts` real q1: «Корни не складываются» / "Ildizlarni qo‘shib bo‘lmaydi" was wrong as stated, because the roots were just added to get 11. It now reads "√49 + √16 ≠ √65" (radicands do not add).
- `bank-algebra.ts`:
  - inequalities q3: the explanation said "negative between the roots" for a non-strict ≤ 0. It now also says the roots give 0, and ends on [−2; 3].
  - modulus q7: the explanation hid the rejected roots −1 and −4. It now shows and rejects them.
  - quadratic q9: p and q were used without x² + px + q = 0.
- `bank-functions.ts` trig q7: the explanation now names the identity cos² α − sin² α = cos 2α.
- `manifest.ts` error tags:
  - powers: added "(a ≠ 0)" to a⁰ = 1, a⁻ⁿ = 1/aⁿ.
  - formulas uz/ru: «площадь — поверхность, объём — пространство», "hajm — fazo" and "Doira: uzunlik 2πr" (a disc has no length) → units of measure, "Aylana uzunligi 2πr, doira yuzi πr²", «Длина окружности… площадь круга», "to‘la sirtining yuzi", «площадь полной поверхности».
  - domain ru: «подкоренное выражение чётной степени» → «выражение под корнем чётной степени».
- `drills.ts`:
  - fractions explain: subtraction was left out, and «при умножении — напрямую» was vague. It now says numerator × numerator, denominator × denominator.
  - lost_root explain: "factor the equation" → "move everything to one side, factor, set each factor to zero".
  - units i3: the unit was missing from the answer (20 m/s).
  - trig i2, i5, i6: the explanations now state the value.
  - vieta i6: now "keltirilgan kvadrat tenglama" / «приведённое квадратное уравнение», with p = −(x₁ + x₂), q = x₁x₂ shown.
- `lessons.ts`:
  - interval-method: the check explanation now covers the roots, not only "outside" («Парабола неотрицательна вне корней» was imprecise). Step 5 now says ends are included or excluded by the sign.
  - percent body: added "× 100".
  - Check explanations for quadratic, vieta, trig-table, percent and exp-substitution now end on the keyed answer.

**Consistency (20)**
- Glossary "mini-sinov" (with a hyphen): 12 × "mini sinov" → "mini-sinov" across manifest (tagline, description, menu, /mock), bank (mock title), rubrics, samples (4) and plan (2).
- Glossary «еженедельный отчёт»: 4 × «Недельный отчёт» → «Еженедельный отчёт» (menu, /report, sample title, weekly reminder).
- `plan.ts` daily[5]: uz "Kecha xato qilgan masalalaringiz…" (yesterday) had no match in ru and is often untrue. "Kecha" was dropped and "xatolar daftarida" added.
- `lessons.ts` exp-substitution example: it was a plain string with an Uzbek word, "(t = −1 yo‘q)", shown to Russian learners too. It is now a uz/ru pair, «(t = −1 не подходит)», using the same `L | string` parameter the other lessons use; verified through `packFor`.
- `bank-numbers.ts` natural q2 hint: uz lacked ru's "the first one" (birinchisini).
- `bank-geometry.ts` solid-vectors q9: ru now matches uz ("a cube with edge 1", vector of the diagonal / of the edge).

**Language (~60)**
- Uzbek "N% i / N% ini" → "N foizi / N foizini": 8 × in bank-numbers, diagnostic, drills and manifest.
- Uzbek terminology:
  - "kesmadagi" / "oraliqdagi" instead of "[0; 2π] dagi" (3 trig prompts and the trig writing task).
  - "Tenglamalar / Tengsizliklar sistemasini yeching".
  - "yig‘indisi … nechta qo‘shiluvchi" instead of "yig‘indi … nechta had" (progression q7, write.progression).
  - "To‘la sirtining yuzi", "yon sirtining yuzi", "shar sirtining yuzi".
  - "Pifagor teoremasi".
  - "Keltirish formulalari" / «Формулы приведения».
  - "O‘rinlashtirish (tartib muhim) … Guruhlash" in the combinatorics lesson.
  - "o‘yilgan (bo‘sh) nuqta" instead of the colloquial "teshik" in straight quotes.
  - «gerb» instead of "gerb".
  - "markaziy burchagi 60° bo‘lgan sektor".
  - "tayanch mavzulari o‘zlashtirilgan" instead of "asosiy mavzulari mustahkam bo‘lgandan keyin" (manifest description).
- A Russian word inside Uzbek text: "qatorining kengligini (размах) toping" → "qatorining kengligini toping"; the explanation defines the term.
- Full-sentence prompts instead of fragments:
  - diagnostic: "Yuzi?" / «Площадь?», "Gipotenuza?", "Hajmi?", "…sektori yuzi?", "…ning ildizlari?" → "…ni toping." / «Найдите…».
  - Lesson checks and drills in the same pattern.
  - Coordinate prompts: "A(1; 2) va B(4; 6) nuqtalar berilgan" / «Даны точки…», "Uchlari … bo‘lgan uchburchak" / «треугольника с вершинами…».
- Russian:
  - «Обратите 0,(36) / 0,(18) в обыкновенную дробь» → «Запишите периодическую дробь … в виде обыкновенной».
  - «Подготовка к математике на вступительном тесте…» → «Подготовка к математической части вступительного теста в вузы».
  - «после того как окрепли её базовые темы» → «базовые темы которой уже освоены».
  - «Показательные и логарифмы» → «Показательная функция и логарифмы».
  - «Во сколько тысяч сумов превратятся 1 000 тысяч» → «Сколько тысяч сумов будет на вкладе в 1 000 тысяч сумов через 2 года?».
  - «Вернёмся с короткого набора» → «Начнём снова с короткого набора».
  - «Сложите логарифмы в один» → «Замените сумму логарифмов логарифмом произведения».
  - «около критических точек» → «в окрестности критических точек».
  - «оба одного цвета» → «оба шара одного цвета».
  - «почему отброшено значение» → «какое значение отброшено и почему».
- Uzbek:
  - "Bitta misol juftlik", "Son − 1 ifoda", "so‘zma-so‘z aniqlang", "o‘zingiz haqingizda" (word order), "Birgalikda necha kunda bajaradi?" → "Ikkalasi birgalikda bu ishni…".
  - "Omonatga yiliga…" (compound interest) rewritten.
  - Modality in the domain tag: "bo‘lmasligi … bo‘lishi kerak".

### [VERIFY]
- `bank.ts` mock titles "majburiy blok (10 savol)" / "mutaxassislik fani (30 savol)" and `rubrics.ts` projections (10 compulsory, 30 specialised maths questions), plus 2 minutes a question from "90 questions in 180 minutes". The code says these come from subject-core's draft UZ_ADMISSION_2026, "confirmed so far only from press reports". They match my understanding of the current test, but I could not check the agency's published 2026 rules. Confirm before launch.
- `bank-applied.ts` statistics q5: "qator kengligi" as the Uzbek school term for размах (range). It is widely used, but some textbooks may use another term. A teacher should confirm it against the current algebra textbook.
- `lessons.ts` interval-method: "o‘yilgan (bo‘sh) nuqta" for a punctured point. It is standard in the textbooks I know; confirm it matches the term the Admission service uses.
- `diagnostic.ts` intro: "Bilmasangiz, taxmin qiling" / «выберите наугад» tells learners to guess on the placement test. That inflates placement. It is a product choice, so I left it.

### Glossary proposals
- Hint (uz) in the B3 maths coach: use **maslahat**, not "ishora". In maths, "ishora" means a sign (+/−); the pack has the error tag "Ishora xatolari", so "ishora" for hint is ambiguous. The coach UI already uses "maslahat" (`coach.mistakes.hints`).
- Add the B3 maths terms used in the pack: tenglama / уравнение, tengsizlik / неравенство, ildiz / корень, aniqlanish sohasi / область определения (ОДЗ), hosila / производная, boshlang‘ich funksiya / первообразная, arifmetik / geometrik progressiya, keltirilgan kvadrat tenglama / приведённое квадратное уравнение, kesma / отрезок, oraliq / промежуток (интервал), qator kengligi / размах [VERIFY], o‘rinlashtirish / размещения, guruhlash / сочетания, o‘rin almashtirish / перестановки.
- ru minutes after a number placeholder: add the rule "«{minutes} мин.», never «{minutes} минут»" next to the credits rule.

### Tests
- `deno run --no-lock --allow-read packages/coach-packs/scripts/check.ts maths`: ✓ (75 activities, 2 rubrics, 24 diagnostic items)
- `deno run --no-lock --allow-read packages/coach-packs/scripts/calibration.ts maths`: ✓ (exact 0.917, adjacent 1, MAE 2.083), unchanged
- `deno test --no-lock packages/coach-packs/test/`: 22 passed, 0 failed (includes the maths answer test)
- `deno test --no-lock -A supabase/functions/schood-ai/coach/`: 32 passed, 0 failed (includes e2e-maths)

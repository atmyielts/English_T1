## IELTS question types (packages/coach-packs/ielts/question-types.ts)
Counts: language 8 · fact 1 · answer 0 · consistency 1 · honesty 0 · placeholder 0
### Changes
- `question-types.ts:~95-97` form_completion (fact) "ONE WORD AND/OR A NUMBER means only one word" (all 3 languages) was misleading: the
  limit allows a number as well → "means one word at most, with or without a number" / "ko‘pi bilan bitta so‘z degani, son bilan yoki
  sonsiz" / "это максимум одно слово, с числом или без него". Also en "Spelled names" → "Names that are spelt out" (British, clearer).
- `question-types.ts:~62-66` summary_completion (language, consistency) uz name "Xulosani to‘ldirish" reads as "complete the
  conclusion" and collides with the glossary's "xulosa" = brief → "Qisqacha mazmunni to‘ldirish" (and "xulosa" → "qisqacha mazmun"
  in the strategy). ru "Заполнение пересказа" (пересказ = oral retelling) → "Заполнение краткого содержания"; strategy rewritten to
  match ("…какую часть текста оно передаёт…", tautological "перефразированные фразы" → "места, которые … сказаны другими словами").
- `question-types.ts:~97` ru form_completion: "предскажите каждый пропуск: имя, число, дата, улица" (wrong case, odd verb) →
  "предположите, что нужно вписать в каждый пропуск: имя, число, дату, улицу"; "Имена по буквам … точными" → "Имена, которые диктуют
  по буквам, и числа должны быть записаны абсолютно точно".
- `question-types.ts:~107` ru note_completion: tautology "если пропустили один пропуск" → "если не успели заполнить пропуск";
  "не выходите за лимит" → "за лимит слов".
- `question-types.ts:~117` ru listening MC: "звучит другими словами, чем в варианте" → "звучит не теми словами, что в варианте".
- `question-types.ts:~126` uz listening matching: calque "variantlar esa yo‘q" → "variantlar esa bunday emas".
- `question-types.ts:~46` ru matching information: "ждите, что…" → "будьте готовы к тому, что…".
### [VERIFY]
- none. (Checked: "always extra headings" in Matching headings matches the official IELTS description; strategy claims are framed as
  "usually/often", no invented official rules.)
### Glossary proposals
- Summary completion (question type): uz "qisqacha mazmunni to‘ldirish", ru "заполнение краткого содержания" (keep "xulosa" for brief).

## IELTS vocabulary decks (packages/coach-packs/ielts/vocabulary.ts)
Counts: language 12 · fact 1 · answer 2 · consistency 0 · honesty 0 · placeholder 0
### Changes
- Unfair poll distractors (answer):
  - `vocabulary.ts:~982` groundbreaking: "connected with digging the ground before new buildings are put up" is a real literal sense
    ("a groundbreaking ceremony"), so a learner could defend it → "connected with the study of rocks, soil and the structure of the earth".
  - `vocabulary.ts:~295` reliance: "a feeling of trust in a stranger’s honesty" overlaps with reliance = "trust in" → "the quality of
    always being honest and keeping your promises" (reliability trap, clearly wrong).
- `vocabulary.ts:~62` sustainable (fact): "sustainable forms of transport, such as electric buses and safe cycle lanes" (lanes are not a
  form of transport) → "…such as electric buses and cycling."
- uz translations (language):
  - emissions "havoga chiqarilmalar" (not a word) → "havoga chiqariladigan chiqindilar, chiqindi gazlar (emissiya)".
  - rote learning "yodlash" (= any memorising) → "quruq yodlash (…)" (the sense of the card).
  - congestion "(transport) tirbandligi" (possessive -i hangs without its noun) → "tirbandlik, transport tirbandligi".
  - commute "(har kuni) ishga qatnamoq" missed "or study" in the meaning → "(muntazam) ishga yoki o‘qishga qatnamoq".
  - endorse "ommaviy qo‘llab-quvvatlamoq" (= mass support) → "omma oldida qo‘llab-quvvatlamoq (…)" (= publicly).
  - deplete "sarflab kamaytirib yubormoq" (clumsy) → "kamaytirib yubormoq"; influx "ko‘plab kelib tushish" (used of goods/money)
    → "birdaniga ko‘plab kelish"; patron "mesenat" → standard spelling "metsenat".
- ru: freelance "внештатный, фриланс" (noun given for an adjective) → "внештатный, работающий на фрилансе".
- en (language): chronic meaning "or keeping coming back" → "or coming back again and again"; obesity example "as fast food grows
  cheaper and more available" → "becomes cheaper and more widely available"; nutrition collocation "a balanced diet and nutrition"
  (not a collocation) → "proper nutrition"; crack down on distractor "used to be against the law in the past" (redundant) → "…against
  the law"; revenue distractor "owns or rents" (rented property is not the company's value) → "owns".
- Checked all 132 cards: meanings, translations (sense, not a different sense), examples and the other distractors are correct; no
  other distractor is a valid synonym. All poll options stay ≤ 100 characters (validator passes).
### [VERIFY]
- none.

## IELTS drills (packages/coach-packs/ielts/drills.ts)
Counts: language 14 · fact 1 · answer 4 · consistency 13 · honesty 0 · placeholder 0
### Changes
- Answer keys / ambiguous items (answer):
  - `drills.ts:~127` a8 "A new park opened… ____ park now attracts…": "That" is equally correct but was marked wrong → key
    ['the', 'this', 'that']; the "This also works" line now says "This or that" in en/uz/ru.
  - `drills.ts:~1363` k7 "____, some people still enjoy…": "Nonetheless" (same as accepted "Nevertheless") was marked wrong → added
    'nonetheless' to the key.
  - `drills.ts:~676` f3 "there would be ____ traffic in the city centre": "little" also fits grammatically, so the comparative was not
    forced → prompt now ends "…in the city centre than there is now." (only "less" fits; explanation unchanged).
  - `drills.ts:~873` g8 "Write one word that joins the two clauses into one correct sentence": "and" does that too but was marked wrong
    → prompt "Write one word that joins the two clauses and shows the contrast:" (matches the explanation and key).
- `drills.ts:~339` c5 uz (fact, consistency): "Takrorlanuvchi harakatlar uchun ko‘pincha davomli zamon ishlatiladi" stated the error as if
  it were the rule; en/ru say "Russian and Uzbek speakers often use…" → "O‘zbek va rus tillarida so‘zlashuvchilar … ko‘pincha davomli
  zamonni ishlatadi, lekin…".
- `drills.ts:~71-74` a4 model sentence (language): "Nowadays the internet has changed…" (nowadays + present perfect is unnatural) →
  "In recent years the internet has changed…" in all four options (same errors kept in the wrong options).
- `drills.ts:~1237` j8 model answer "I cook most evenings, mostly simple dishes" → "usually simple dishes"; explanation "does not answer
  about you" / "siz haqingizda javob bermaydi" / "не отвечает о вас" → "says nothing about you" / "siz haqingizda hech narsa demaydi" /
  "ничего не говорит о вас".
- `drills.ts:~1088-1090` i6 (fact): "give attention" / "turn attention" were called translation errors outright, but "give attention to"
  and "turn your attention to" are real English → "In this sentence … are wrong: they translate … word by word" (en/uz/ru).
- `drills.ts:~150` ru (language): "После there is / there are глагол определяет существительное…" (reads as "the verb decides the noun")
  → "форму глагола определяет существительное…".
- `drills.ts:~446` d4 uz: the Uzbek-only note "«5 foizga oshdi» ham «rose by 5%»" mixed per cent and percentage points in an item about
  points → "«5 foizga oshdi» ham «rose to» emas, «rose by» bo‘ladi."
- uz (language): a2 "umumiy sayyohlar artiklsiz keladi" (calque) → "umuman sayyohlar haqida gap ketganda artikl qo‘yilmaydi"; a4
  "Ikkala the dan birini" → "Ikki the’dan birini"; sentence boundaries "O‘zbek va rus tinish belgilari … yo‘l qo‘yadi" → "O‘zbek va rus
  tillaridagi tinish belgilari qoidalari …"; 8 × detached suffix after a Russian quote ("«вырос на» dan", "«принять решение» ning")
  → attached ("«вырос на»dan", "«принять решение»ning"), as elsewhere in the pack ("«many»dan").
- Exam part names (consistency, glossary "Part 1–3 … same | same"): 7 × uz "1-qism/2-qism/3-qism" → "Part 1’da", "Part 1’dagi", "Part 3
  javobiga" etc.; 6 × ru "в части 1/2/3" → "в Part 1/2/3". drills.ts already mixed both in ru (a5, b3 used "Part 1").
### [VERIFY]
- `drills.ts:~1171` j3 "Prices ____ significantly" accepts increased/rose; "climbed" (and arguably "grew") is also formal and correct.
  Left as is (not wrong, only narrow); lead may add 'climbed'.
- `drills.ts:~1226` j7 "I am writing to ____ about the delay" accepts complain/enquire/inquire; "ask" is neutral and widely used in
  formal letters. Left as is (the item teaches the formal set); lead may add 'ask'.
- `drills.ts:~1115` i8 says "make/do a crime" translate Russian «совершать преступление»; true for Uzbek «jinoyat qilmoq», looser for
  Russian (совершать ≈ commit). Left; a native Russian teacher may prefer "под влиянием «делать»".
### Glossary proposals
- Exam parts: the glossary says "Part 1–3" stays in English in uz/ru, but manifest.ts, speaking.ts, samples.ts and rubrics.ts use
  "1-qism" / "части 1". I applied the glossary in drills.ts; the lead should pick one form pack-wide (recommend the glossary, with
  uz suffixes "Part 1’da", "Part 2’dagi").
- Run-on/fragment (error tag sentence_boundaries): uz "Uzilmagan gaplar va bo‘laklar" is understandable but "bo‘lak" clashes with the
  grammar term "gap bo‘lagi" (sentence member). Proposal: "Qo‘shilib ketgan va chala gaplar" (fragment = "chala gap"). Not changed,
  because manifest.ts (other owner) uses the same title.

## Checks run
- `deno run --no-lock --allow-read packages/coach-packs/scripts/check.ts ielts` → ✓ (55 activities, 12 decks, 11 drills).
- `deno run --no-lock --allow-read packages/coach-packs/scripts/calibration.ts ielts` → ✓ all three rubrics.
- `deno test --no-lock packages/coach-packs/test/` → 22 passed, 0 failed.
- `deno test --no-lock supabase/functions/schood-ai/coach/` → 32 passed, 0 failed.

## Follow-up after lead decision (drills.ts; manifest.ts checked)
Counts: consistency 23
- Exam parts: per the updated glossary (parts are uz "1-qism", ru "часть 1"), all 16 uz/ru "Part N" in drills.ts (my 13 plus the
  ru ones already in a5/b3) are now "1-qism javoblarida", "1-qismdagi", "1-/2-/3-qismda", "3-qism javobiga"; ru "в ответах части 1",
  "в быстрых ответах части 1", "В части 1/2/3", "нужна в части 3", "ответ для части 3". None remain in uz/ru strings.
- Run-on/fragment: manifest.ts already had uz "Qo‘shilib ketgan va chala gaplar" / ru "Слитные и незаконченные предложения", so I
  made no change there. In drills.ts the title now matches it, and the body follows: uz 3 × "bo‘lak" → "chala gap"; ru 3 × "обрывок"
  → "незаконченное предложение" (g1: "стало незаконченным предложением, которое не может стоять отдельно").
- Re-run: check.ts ielts ✓; deno test packages/coach-packs/test/ → 22 passed, 0 failed.

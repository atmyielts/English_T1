# Schood AI: content review (uz, ru, en), 2026-10-31

A line-by-line review of the learner-facing content of Schood AI before launch: the six coach packs, the
engage stories and journeys, every area's UI catalogs and the Telegram message texts. The terms used
everywhere are in [`ai-content-glossary.md`](ai-content-glossary.md). The full change list for each pack
or area, with before/after examples, is in [`ai-content-review/`](ai-content-review/).

Content and catalogs only: no keys, ids, schemas, option order or logic changed, except the few items
listed under "Changes beyond wording".

## Fixes by pack and area

| Pack or area | Language | Fact | Answer | Consistency | Honesty | Placeholder | Total |
|---|---|---|---|---|---|---|---|
| B1 IELTS | 118 | 33 | 7 | 62 | 4 | 4 | 228 |
| B2 Speaking | 88 | 14 | 5 | 15 | 5 | 0 | 127 |
| B3 Maths | 60 | 42 | 3 | 20 | 3 | 5 | 133 |
| B4 Sales | 555 | 11 | 2 | 71 | 7 | 0 | 646 |
| B5 Career (with the learner area's study-abroad data) | 288 | 16 | 0 | 56 | 10 | 0 | 370 |
| B6 Public Speaking | 192 | 34 | 2 | 60 | 14 | 5 | 307 |
| Engage stories, journeys, seasons, certificates | 60 | 6 | 0 | 55 | 12 | 0 | 133 |
| UI catalogs (core, coach, engage, learner, teacher, centre) | 422 | 19 | 0 | 315 | 11 | 81 | 848 |
| Telegram texts (coach bots, student bot, briefs, reminders, win-back) | 65 | 2 | 0 | 35 | 3 | 0 | 105 |
| **Total** | **1,848** | **177** | **19** | **689** | **69** | **95** | **2,897** |

Counts are per fix as each reviewer logged it; a fix repeated across many strings is often counted once
("12 × …"), and a uz+ru pair fixed together usually counts once. "Answer" counts items where a right answer
was marked wrong, two options were defensible, or a hint/solution contradicted the key.

Detail logs: IELTS [core](ai-content-review/ielts-core.md), [reading and listening](ai-content-review/ielts-reading-listening.md),
[vocabulary and drills](ai-content-review/ielts-vocab-drills.md) · Speaking [core](ai-content-review/speaking-core.md),
[role-plays and drills](ai-content-review/speaking-roleplays-drills.md) · [Maths](ai-content-review/maths.md) ·
Sales [role-plays](ai-content-review/sales-roleplays.md), [drills](ai-content-review/sales-drills.md),
[lessons](ai-content-review/sales-lessons.md) · Career [facts and role-plays](ai-content-review/career-facts-roleplays.md),
[drills and lessons](ai-content-review/career-drills-lessons.md), [writing](ai-content-review/career-writing.md) ·
Speech [core](ai-content-review/speech-core.md), [drills](ai-content-review/speech-drills.md) ·
[Engage content](ai-content-review/engage-content.md) · UI [core and coach](ai-content-review/ui-core-coach.md),
[engage and learner](ai-content-review/ui-engage-learner.md), [teacher](ai-content-review/ui-teacher.md),
[centre](ai-content-review/ui-centre.md) · [Telegram](ai-content-review/telegram.md).

## The worst issues found

1. **Right answers marked wrong.**
   - IELTS drills rejected "that" (a8) and "nonetheless" (k7). Two other prompts (f3, g8) also fitted a second answer.
   - Speaking gap drills rejected "We **come** from Uzbekistan" and "What time **did** the museum open?" (mb3, mb6, qf4, ar3, wo3).
   - Two IELTS vocabulary polls had a distractor that was also correct ("groundbreaking", "reliance").
   - The Uzbek signposts lesson in B6 had two right options, because "ishora" also means a gesture.
   - Maths `lesson.motion-work` had a second correct option. Triangles q7 ended its solution on 57 while the key is √57.
2. **Promises and invented figures.**
   - The IELTS tagline sold "a full IELTS examiner" with plain "bands". It now says examiner-style, with estimated bands.
   - The B5 tagline promised "a CV that gets calls".
   - Two journeys were named as outcomes ("IELTS 5.5 → 7.0 in 16 weeks", "Speaking confidence in 60 days"). They are now programmes ("Towards IELTS 7.0: a 16-week programme").
   - Certificates did not say they are not official results. They do now, in all three languages, in the coach bot and the engage area.
   - Sales, career and speech lessons stated rules of thumb as facts ("the first 20 seconds decide", "three is the number the ear remembers best"). These are softened to honest guidance.
3. **IELTS band descriptors out of line with the public descriptors.** 15 were rewritten in the pack's own words. A General Training letter with a missing bullet point could reach Task Achievement 5; the public band for that is 4.
4. **Wrong meaning in translation.** Many uz/ru strings said something different from the English, for example:
   - ru «пригород» (suburb) for countryside flipped a True/False/Not Given explanation;
   - uz "muzlatgich" (a refrigerator) for a streak freeze;
   - uz "Boshlovchilarga" (to TV presenters) for "to beginners";
   - ru «пропуск {coach}» for the coach pass;
   - uz "two days off a month" for "two weekends a month";
   - ru «я компенсировал» reversed a sales line;
   - uz "16 yoshdan katta" left 16-year-olds out of a UK visa fact.
5. **Inconsistent product terms.**
   - ru mixed «коуч» and «тренер», and "Approve & run" had three Russian names.
   - uz/ru translated "Materials Studio" and "Live Quiz".
   - "Role-play" had four forms ("rolli suhbat", «ролевые диалоги»…).
   - Exam parts mixed "Part 1" and "1-qism", and Listening used "Section", which the test no longer uses.
   - All of these are now one term per language (glossary).
6. **Placeholders and plurals.** English produced "1 days to your exam" and "no more than 1 words". Russian had «{minutes} минут» for any number, «1 минут практики», and «У {coach}» with a nominative coach name. 81 catalog placeholder fixes were needed, most of them in the teacher catalogs.
7. **Privacy and behaviour copy that was wrong.**
   - The consent text said pinned chats survive the 180-day clean-up, which deletes them too.
   - The Skill Passport label hint said "only you see this label", but the public page shows it.

## Decisions taken in this review (now in the glossary)

- Exam skills and tasks stay in English (Speaking, Task 2). Exam parts are uz "1-qism" and ru «часть 1».
  IELTS Listening has Parts 1–4, not Sections.
- Russian: the Telegram coaches are always «коуч», generic AI is «ИИ», and the coach always says «вы».
  Feature names are not in the ты form («Как сказать лучше»).
- "Approve & run" is uz «Tasdiqlash va bajarish», ru «Подтвердить и выполнить», everywhere it is quoted.
- The single-coach pass is uz "abonement", ru «абонемент». Role-play is "rolli o‘yin" / «ролевая игра».
  A streak freeze is "muzlatish", and the weekly challenge is "haftalik chellenj" ("sinov" is a mock).
- Journey names follow "<target>: an N-week programme", never "X → Y in N weeks".
- Learner daily brief: "kunlik mashq" / «ежедневная разминка». Parent and owner briefs: "xulosa" / «сводка».

## Changes beyond wording (please check)

- `sales/samples.ts`: two criterion scores now match the rubric's own level examples:
  - `sample.review-cold-call`, closing 2 → 1.5;
  - `sample.dm-report`, next_step 1 → 2.
  
  The overall levels are unchanged.
- `sales/roleplays.ts`: three persona names moved from `nm()` to `T()`, so the uz text spells them the Uzbek way
  (Ulug‘bek, Farrux Alimovich, Karimov). The English keeps "Mr Karimov", which the calibration quotes.
- `maths/lessons.ts`: one lesson example was a single string with an Uzbek word that Russian learners also saw.
  It is now a uz/ru pair, the form the other lessons use.
- Answer keys: IELTS drills a8 and k7 accept the extra right answers. All other answer fixes reworded the
  prompt and left the key as it was.
- IELTS assessor rule (`rubrics.ts`, `writing.ts`): a General Training letter with a missing bullet point is capped
  at Task Achievement 4, as in the public descriptors. No calibration sample has a missing bullet, so no
  reference score moved.

## Still `[VERIFY]` (not stated as fact in answers; owner or specialist to confirm)

**Facts and official rules**
- B5 / study abroad: the remaining unverified entries still show "check on the official site" (`checked: null`):
  - `us.ds160`: travel.state.gov blocks automated fetches (403);
  - `de.visa`: the Foreign Office page only links onward;
  - `de.money`: the site refused the connection;
  - `kr.visa`: D-2/D-4 are not on the Study in Korea home page.
- `uk.money.living` is confirmed on gov.uk but stays unverified, because `learner.test.ts` expects it to.
  Promote it and update the test together.
- Every statement in the nine `career/facts.ts` datasets was re-read against its source on 2026-10-31 and
  still matches. `CHECKED` (2026-10-30) can move to 2026-10-31.
- B3: the admission exam structure (10 compulsory + 30 specialised maths questions, 2 minutes each) comes from a
  draft confirmed only by press reports. It is in mock titles and projections.
- B5: whether licensed private employment agencies in Uzbekistan may charge job seekers. The advice "never
  pay to get a job" is kept as safety advice.
- Engage: the month of the Tashkent International Book Fair (May in the story).
- IELTS: the Tashkent–Chimgan drive time, now "less than two hours’ drive".

**Usage and terms (native or specialist check)**
- uz cover letter: "motivatsion xat" or "kuzatuv xati", and hh.uz's labels for the cover letter and the «O‘zim haqimda» CV block.
- uz maths terms: "qator kengligi" (range, размах); "o‘yilgan (bo‘sh) nuqta" (an excluded point on the number line).
- ru «Ассалому алейкум» or «алайкум»; uz filler spelling "yani" or "ya’ni" (what speech-to-text returns).
- IELTS drill i8: the claim that "do/make a crime" comes from Russian «совершать преступление».
- IELTS listening ~146: uz "opasi" (older sister) for "my sister" (Uzbek has no neutral word).
- uz `history.unpin` "Mahkamlashni olib tashlash" (26 characters); ru Telegram start button «Запустить».
- teacher uz print hint «PDF sifatida saqlash» (Chrome's Uzbek label).
- Russian gendered past tense is still in some sample speakers' lines (career, speech). Lines learners copy are now neutral.

**Content and level choices**
- IELTS `audience` says band 4.5–8.0 but `levels` is `[4, 8.5]`. `T1_END`/`T2_END` keep the exam's fixed
  instruction lines.
- IELTS filler list counts `kind of` and `sort of` as fillers ("this kind of food"), which inflates fillers per minute.
- Speaking placement g7 (wish + past perfect) is tagged C1 and g4 is tagged B1. They are more usually B2 and A2.
  The tags drive scoring and were not changed.
- Pace bands: 110–170 wpm is used for Uzbek and Russian too, and has no source. Longer words may make normal
  speech count as "slow". Consider a band per language.
- IELTS drill j3 could also accept "climbed", j7 "ask", Speaking po6 "consider"/"try".
- Sales:
  - the call and message rubrics disagree on "call me if you need" (L1) and "write if interested" (L2);
  - calibration m12's top message includes a testimonial the task does not give;
  - the coworking role-play needs the co-founder to be mentioned, but has no goal that asks who else decides;
  - three role-plays keep a percent or months in the hidden `budget` field ("Budget: 0" in the review).
- Speech: calibration t01–t03 measure 6 fillers where the transcripts have 5, 7 and 5. In the weekly sample,
  "long pauses" rising from 1 to 3 has no lower-is-better flag.
- Sales story ("First Month on the Floor"): the "Day N" titles cannot all be literal against the trial days and
  "twenty working days". Decide whether Day N means episode N.
- Product questions:
  - Plus Family grants 300 credits but is described as "Plus for up to three children";
  - is "Coach Team" a name;
  - `centre.my.toolsHint` says each answer uses one credit, while some tools are priced higher;
  - the consent text is still marked for owner review.
- `docs/product/44_SCHOOD_AI.md:175` still quotes the old journey names.

## Code issues found (not changed: outside a content review)

- `supabase/functions/schood-ai/coach/delivery.ts:89`:
  - an empty `{name}` gives ", today’s task…";
  - before placement, `{level}` is "—", which gives "about band —".
- `apps/schood-ai/src/engage/pages/Memory.tsx:65`: the weak spot shows a raw key such as `ielts.listening`.
- `apps/schood-ai/src/teacher/…/Marking.tsx:50`: `t('teacher.marking.level')` has no `level`, so the screen shows
  "{level}". `teacher.studio.level` fits.
- `apps/schood-ai/src/centre/…/setup.tsx:33`: the Academy role (for example "owner") is shown untranslated.
- `supabase/functions/schood-ai/learner/telegram.ts:84`: `brief_status` puts the English word "off" into uz/ru text.
- `workers/schood-coach-bots/src/worker.ts:110`: `link.failed` shows the raw error code ("invalid") inside a uz/ru
  sentence.
- `ai_purge_old_chats(180)` also deletes pinned chats. The consent text now says so. If pinned chats should be
  kept, change the function and the text together.
- `supabase/functions/_shared/english-roleplay.ts:61` (shared with the English apps, not edited):
  - uz "tez-tez savol beradi" ("asks often") should be "tezkor savollar beradi";
  - the file still writes `ʻ` for o‘/g‘.

## Follow-ups made by the lead after the reviewers finished

- `speech/manifest.ts` (monotone tag): "rise for a question" is now limited to yes/no questions, as in the
  drills. Wh-questions fall in all three languages.
- `career/plan.ts`: «Полное пробное интервью» is now «пробное собеседование» (glossary).
- `sales/manifest.ts`: "The first 20 seconds decide" is now "often decide", matching the lessons.
- `sales/calibration-call.ts`: the task note named a role-play id that does not exist (`rp.negotiation-wholesale`).
  It is now `rp.negotiation-supermarket`.
- `sales/samples.ts`: uz "namunaviy" (exemplary) is now "… namunasi" (a sample), in 3 places.

## Checks run on the final tree

- `deno run --no-lock --allow-read packages/coach-packs/scripts/check.ts`: all six packs pass.
- `deno run --no-lock --allow-read packages/coach-packs/scripts/calibration.ts`: all 12 rubrics pass. Agreement is unchanged.
- `deno test --no-lock packages/coach-packs/test/`: 22 passed, including the maths answer test.
- `deno test --no-lock supabase/functions/schood-ai/`: 225 passed.
- `deno test --no-lock workers/schood-coach-bots/test/`: 8 passed.
- `deno test --no-lock --no-check workers/schood-bot/src/schood-ai.test.ts`: 6 passed.
- `deno run --no-lock --allow-read scripts/check-schood-ai-teacher-i18n.ts`: pass.
- `deno test --no-lock apps/schood-ai/tests/`: 1 passed.
- The reviewers' own checks found every catalog key set, placeholder name and Russian plural form identical
  across en/uz/ru.
- `npm --workspace apps/schood-ai run build`: built.
- `npm run verify:prod`: passed.

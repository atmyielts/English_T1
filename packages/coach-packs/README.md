# Schood Coaches: the pack format

Every Schood coach (B1–B6) is **a pack and a bot token**. The engine is shared: the bot
flows, scoring, memory, plans, reminders, reports, certificates, the Mini App screens and
the Telegram worker. A pack is data only: TypeScript objects that are validated when the
engine loads them and again in CI.

- B1 **IELTS Coach** (`ielts/`) and B2 **Speaking Partner** (`speaking/`) are the reference
  packs for single-language coaches. B3 **Admission Maths** (`maths/`), B4 **Sales** (`sales/`),
  B5 **Career and Interview** (`career/`) and B6 **Public Speaking** (`speech/`) are the
  reference packs for coaches in several languages. Read them alongside this guide.
- The types live in `src/types.ts`. Each field is documented there.
- The rules live in `src/validate.ts`. Every problem is reported with its path, such as
  `manifest.name: missing uz` or `depth: writing tasks: 0 of at least 6`.

## Adding a coach

1. **Create a folder** `packages/coach-packs/<id>/` (the id matches `^[a-z][a-z0-9-]{1,15}$`;
   it becomes `/tg/<id>` and `/coach/<id>`). It needs:
   - `index.ts`: `export default definePack({ manifest, diagnostic, rubrics, activities, questionTypes, fluency, plan, reminders, milestones, samples, facts? })`.
   - `manifest.ts`, exporting `manifest`, and `samples.ts`, exporting `samples`. The Mini
     App's examples page loads these two files by path, so keep the names.
   - Any other files you like (`rubrics.ts`, `calibration.ts`, one file per activity kind…).
2. **Register it**: add one line to `PACK_SOURCES` in `src/registry.ts`.
3. **Check it**:
   ```
   deno run --no-lock --allow-read packages/coach-packs/scripts/check.ts <id>
   deno run --no-lock --allow-read packages/coach-packs/scripts/calibration.ts <id>
   deno test --no-lock packages/coach-packs/test/ supabase/functions/schood-ai/coach/
   ```
4. **Bot and settings** (owner and coordinator; see `workers/schood-coach-bots/README.md`):
   - Create the bot in BotFather.
   - Set the worker secrets `COACH_BOT_TOKEN_<ID>` and `COACH_WEBHOOK_SECRET_<ID>`, where
     `<ID>` is the id upper-cased with `-` written as `_`.
   - Add `<id>:<bot id>:<username>` to `SCHOOD_AI_COACH_BOTS`.
   - Run `workers/schood-coach-bots/scripts/setup-webhooks.ts <id> --apply`.

No code change is needed:

- **Prices** exist for every coach feature: `coach_b1.*` to `coach_b6.*` in
  `packages/ai-core/src/credits.ts`, actions `turn review writing ladder photo drill voice shadow script`.
- **The plan matrix** already includes B1–B6 in Plus and Plus Family.
- **A single-coach pass** comes from `SCHOOD_AI_COACH_PASS_PRODUCT_IDS=B3:<product uuid>`.
- **Notification kind** `coach.<id>` registers itself.

## Rules for content

- **Original material only.** Write for Schood; never copy published exam books, past
  papers, band descriptors or copyrighted texts. Rubric descriptors are in the pack's own
  words.
- **No invented facts.** No made-up scores, testimonials, official requirements, prices or
  pass rates. Figures in tasks are invented for practice, and the data says so (`note`).
  Real-world rules (visa documents, fees) go only in a dated fact dataset (see "Facts").
- **No model or provider names** anywhere. The credit key and its requirements route calls.
- Content must suit school-age learners.

## Two kinds of text

- `Localized` (`{ en, uz, ru }`): what the learner reads in their interface language.
  Every language in `manifest.uiLanguages` is required.
- A plain `string`: practice content in `manifest.practiceLanguage` (a question, a persona
  line, a passage). It is never translated.

`practiceLanguage` is `en`, `uz`, `ru` or `mixed`. With `mixed` (B4 Sales, B6 Public
Speaking), role-plays, transcription and corrections use the learner's own interface
language. Learners below `explainInUiLanguageBelow` on the pack scale get explanations in
their interface language. Above it, explanations stay in the practice language.

### Practice text in several languages (mixed packs)

In a mixed pack every practice string has a version per interface language. Write it once
with `T({ uz, ru, en })` from `src/localize.ts`, anywhere a plain string goes (a persona's
opening, a question, options, a drill item, a shadowing sentence, a sample's text):

```ts
opening: T({ en: 'Hello, who is this?', uz: 'Allo, kim bu?', ru: 'Алло, кто это?' }),
```

- `definePack` splits it into the plain string in `manifest.contentLanguage` (default `en`)
  plus an `i18n` overlay per other language on the activity, placement item or sample.
- The engine serves each learner `packFor(pack, locale)`: the same pack with their
  language's strings. Only strings change, so answers, option order and ids are the same in
  every language.
- The validator checks each language's version like the base, and reports an overlay that
  misses a language, lands on nothing, or text that never went through `definePack`.
- A mixed pack's deck cards need no `translations`: each language has its own card text.
- Spoken audio is cached per language.
- Activities with no words (`2x + 3 = 11`) need no `T()`.

## Manifest

| Field | What |
|---|---|
| `id`, `feature`, `version` | The pack id; the plan-matrix feature it is sold as (`B3`); the version stored on every session (bump it when content changes). |
| `name`, `tagline`, `description` | Shown in the bot (the setup script sets the bot's name and descriptions from these), the Mini App and the home card. Telegram's limits apply: `name` ≤ 60, `tagline` ≤ 120, `description` ≤ 512 characters. |
| `uiLanguages`, `practiceLanguage` | See above. |
| `audience` | Who it is for and the level range `[min, max]` on the scale. |
| `scale` | The level scale for goals, placement and milestones: IELTS bands (`step: 0.5`), CEFR (`labels` 1 = A1 … 6 = C2), a percentage. |
| `skills` | The skill tree: nodes with `parent`. Every activity, criterion, error tag and diagnostic item names a node. Mastery is kept per node, and a parent's level is the mean of its children. |
| `errorTags` | Recurring errors the engine counts per learner. Each has `explain` (the rule in one or two sentences, read by beginners in uz/ru) and optionally a `drill` that fixes it. |
| `menu` | The bot menu, in order. Actions: `today speaking mock roleplay writing reading listening practice vocab phrases drill shadowing photo lesson mistakes script progress report plan settings help`. Each content action needs content of its kind (`mistakes`: quiz sets; `script`: a `scriptBuilder`). `mock` starts the speaking mock, else the first mini-mock, else the weekly mock role-play. |
| `contentLanguage` | Mixed packs: the language the plain practice strings are written in (see "Practice text in several languages"). |
| `commands` | BotFather commands (`/today`). |
| `correctionModes` | `gentle` and/or `strict`, for role-plays and speaking. |
| `accent` | A hex colour for the Mini App header and certificates. |

## Activities

| Kind | In the bot | Credit actions | What to author |
|---|---|---|---|
| `speaking_exam` | Questions one by one, by voice or text, with real timing. A `long_turn` part has prep and talk timers. Each answer is scored with quotes, fluency numbers and "say it better" lines, and can be re-recorded. `mock: true` runs every part and ends with one examiner-style review. | `turn` per answer, `review` per mock | `parts` with `topics` (groups of questions) or `cards` (cue cards with points, round-off and discussion questions), `answerSeconds`, `rubric`. |
| `roleplay` | A persona with a **hidden state** (numbers, enums, booleans) that reacts to what the learner says, plus goals to achieve. Corrections are gentle or strict. The review scores the learner's own lines, ticks each goal with a quote, shows the scorecard and reveals the state. | `turn` per line, `review` at the end, `voice` for the persona's voice | `persona` (name, role, style, opening, voice), `hiddenState` (`fields`, `initial`, `rules` in plain words), `goals` (`text`, `check`), `scorecard` (`talk_ratio questions_asked average_turn_words pace`), `levelNotes`, `minTurns`/`maxTurns`, optional `phrases`. |
| `writing` | A task by text or photo (handwriting is read first). Scored per criterion with quotes and corrections, then an essay ladder (the learner's own essay rewritten at higher levels) and drills for the errors found. | `writing`, `photo`, `ladder` | `prompt`, optional `data` (a table or chart the Mini App draws), `minWords`, `assessorNotes`, `ladder` levels. |
| `quiz_set` | A timed set. `reading` shows a passage, `listening` plays a script (text-to-speech, or the browser in the Mini App), `practice` stands alone. Answers are buttons or typed answers; there are hints before the answer and explanations after. No AI. | `voice` for listening audio | `questions` with `answer` (option index, accepted strings or `{ numeric, tolerance }`), `explanation`, `evidence`, `wordLimit`, `hints`. |
| `deck` | Spaced-repetition cards (FSRS) as Telegram quiz polls. | none | `cards` with `meaning`, `translations`, `example`, at least three `distractors` (each ≤ 100 characters: poll options). |
| `drill` | Targeted items for one error tag. When the authored items run out, fresh items are made and checked if `aiVariants`. | `drill` for fresh items | `errorTag`, `explain`, `items`. |
| `shadowing` | Listen, repeat, and get the words heard in order (from the transcript). | `shadow`, `voice` | `sentences` with `focus`. |
| `lesson` | A micro-lesson with one check question. No AI. | none | `body`, `example`, `check`. |
| `photo_help` | A photo of a problem: a ladder of hints first, the worked solution only when asked, one charge for the whole ladder. | `photo` (vision) | `subject`, `hintLevels`, `solutionOnRequest`, `instructions`. |

Every activity has an `id` (unique in the pack), `title`, `node`, `levels: [min, max]`,
`minutes` and optionally `tags` and `facts`.

### Topic banks, mini-mocks and the mistake notebook (B3)

| Field | What |
|---|---|
| `QuizSet.draw` | Deal this many questions per session from the set's bank: never answered first, then the ones answered wrong, never one answered right in the last week; easier first, starting near the learner's level on the topic (`QuizQuestion.difficulty` 1–3). |
| `QuizSet.mock` | `{ questions, nodes? }`: a timed mini-mock dealt from the practice banks (of those nodes), each question's topic drawn by node weight like an exam blueprint. No hints. `questions` stays empty. |
| `QuizSet.rubric` | A keyed rubric the result is recorded on (the share right on its scale): milestones, certificates and forecasts then work as for any rubric. |
| `Rubric.keyed` | Results come from the answer key, not a model: no criteria and no calibration set. |
| `Rubric.projections` | Keyed rubrics on a `percent` scale: exam blocks the share is projected onto ("≈ 7 of 10 questions"). Question counts only, never points. |
| `percentile` | `{ rubric, windowDays }`: the anonymous percentile on a keyed rubric (below). |

The **mistake notebook** (menu `mistakes`, the Mini App's `/coach/<pack>/mistakes`) holds
every question whose latest answer was wrong; a session deals up to ten of them, and a right
answer clears one. Sessions store each answer as `<set id>#<question id>`, so a session can
mix banks.

### The topic graph (B3)

- `SkillNode.requires` lists prerequisite nodes (no cycles). B3 builds its tree from
  `packages/subject-core`'s maths topic graph.
- `plan.selection: 'mastery'` chooses each day's sets by topic priority: node weight × the
  gap to the target, a little extra for a topic never tried, much less while a measured
  prerequisite is weak (more than 15% of the scale under the target). A set done today or
  yesterday counts less. The rest of the day fills with the next weakest topics.
- With `scale.fromAccuracy` (a percentage scale), a checked set moves a topic's level as well
  as its mastery, and each set's result moves its own topic node rather than its question
  types' nodes.

### The anonymous percentile (B3)

After each keyed result the learner sees where their latest result sits among the coach's
other learners in the window: "ahead of 64% of 412 learners in the last 30 days".
- The store returns only a histogram: each person's latest result counted per whole score
  (`coach_cohort_histogram()`, migration `20261030700000`). No id, name or session leaves it.
- It is shown only to the learner it is about, and only when at least 30 people
  (`MIN_COHORT`) are in the window. Below that the learner is told it appears later.
- There is no public board. Anything public built on it must leave out under-18s and
  people whose age is unknown (core's `requireAdult`).

### The script builder (B4)

`scriptBuilder: { questions, objectionTypes, roleplay, instructions, maxScripts }`. The
learner answers the questions about their own product, offer and buyers (menu `script`, or
the form at `/coach/<pack>/scripts`); one `script` charge builds a call script: an opening,
discovery questions, a value pitch, an objection map by type, closing lines, next-step
asks, a DM version, a follow-up and watch-outs. Prices, results and guarantees the learner
did not give become `[placeholders]`. Scripts are saved in `coach_scripts` (personal, erased
with the account or the coach history).

`Roleplay.template: 'own_product'` marks the role-play that practises a saved script: its
persona becomes a buyer of the learner's product (given as data, never instructions) and
raises the learner's own objections. It is never listed with the other role-plays.

### Scorecards and goal kinds (B4, B5)

`Roleplay.goals[].kind` is `objection` or `next_step`. The review then shows "Objections
handled: 2/3 · Next step secured: yes" next to the talk ratio and questions asked, and calls
the better lines a replay. A weekly mock may be a role-play (`plan.weeklyMock.activity`).

## Rubrics, evidence and calibration

A rubric has `criteria`, each with `source: 'model' | 'audio'`, `node`, `weight`,
`descriptors` (score → the pack's own words) and `focus`.

- **Evidence.** The assessor must quote the learner word for word (`evidence.min` to
  `evidence.max` quotes per criterion). The engine keeps only quotes found in the answer.
  If a criterion lacks enough real quotes, one repair call is made inside the same charge.
  If it still lacks them, the criterion is reported as not scored. It is never guessed.
- **Audio criteria** (IELTS pronunciation) need the sound itself. They are always reported
  as not scored from a transcript.
- **Overall** = the weighted mean of scored criteria, rounded with `overall.round`
  (`half_up` for IELTS) to `overall.step`. It is null when fewer than half the criteria
  are scored.

**Calibration.** Every rubric carries a calibration set:

- `samples`: at least 8 learner answers across at least 3 levels, each with
  author-rated `reference` scores and a `rationale` a reviewer can disagree with.
- `runs`: at least 2 assessor runs per sample, in the shape the model returns
  (`criteria: { id: { score, evidence: [quotes] } }`).
- `thresholds`: `exact` and `adjacent` agreement, `maxMae`, `maxSpread` (run to run) and
  `evidenceValid`.

CI replays the runs through the real scoring pipeline (`calibration.test.ts`) and fails
below the thresholds. The runs in B1 and B2 are **authored**. They test the pipeline and
the thresholds, but they are not evidence that a real model agrees. Measure a real model
with the live script (it costs real calls; no database, account or credits):

```
SCHOOD_AI_COACH_EVAL_BASE_URL=<https://…/v1> SCHOOD_AI_KEY_COACH_EVAL=<key> SCHOOD_AI_COACH_EVAL_MODEL=<model id> \
  deno run --no-lock --allow-net --allow-env --allow-read --allow-write scripts/coach-calibration-live.ts \
  --pack <id> [--rubric <rubric id>] [--runs 3] [--limit 4] [--out runs.json]
```

Review `runs.json`, then replace the pack's runs with it.

## Placement (no AI, open to everyone)

`diagnostic.items`: 15 to 30 items, each a `question` (2–4 options, one right) or a
`can_do` self-assessment (Yes / Partly / Not yet), with a `skill` and a `level`. The
answers ride in Telegram button data, so someone who has not linked an account can take
the test with nothing stored. This is why there are at most 30 items. A level counts as
reached at `passRatio`.

## Plans, reminders, milestones

- `plan.goal`: target `options` and a `default`; `examDate` (`required`, `optional` or
  `none`); `defaultWeeks` when there is no date.
- `plan.dailyMinutes`: the minutes-a-day options.
- `plan.phases`: phases by weeks left (`minWeeksLeft`, highest first). Each has a `mix` of
  slots (`speaking roleplay writing reading listening practice vocab drill shadowing lesson photo`).
  The daily plan weights the mix by the learner's gap to the target, recurring errors and
  due cards. It is the same for the bot, the reminder and the Mini App on a given day.
- `plan.weeklyMock` (an activity and a weekday); `plan.links` (only `https://*.schood.online`,
  such as the simulator); `plan.estimates` (accuracy → level per set mode, always shown as
  an estimate).
- `reminders`: `daily` (at least 5), `comeback`, `countdown` and `weekly`. Placeholders:
  `{name} {coach} {task} {minutes} {streak} {days} {delta} {level} {target}`.
- `milestones` (at least 3): reached when `count` results on a rubric's `overall` (or one
  criterion) are at least `min` within `withinDays`. Only the highest new milestone per
  rubric is issued, and never a lower one after a higher one. `certificate: true` issues a
  certificate with a verifiable share link (`/coach/verify/<code>`), keeping the evidence
  sessions.

## Samples (for people without a plan)

At least 2 static examples, clearly labelled as examples. Kinds are `speaking_report`,
`writing_report`, `weekly_report`, `roleplay_review` and `plan`; each has a typed `body`
(`SampleBodies` in `types.ts`). Write realistic but invented learners. Never present a
sample as a real person's result.

## Facts (curated and dated)

For coaches whose practice touches real rules, such as B5's student-visa interview:

```ts
facts: [{ id: 'visa-x', title: {…}, topic: 'student visa interview', checkedAt: 'YYYY-MM-DD', maxAgeDays: 90,
          source: { name: 'The official site', url: 'https://…' }, entries: [{ id: 'docs', statement: {…} }] }]
```

An activity lists the datasets it relies on in `facts: ['visa-x']`. Then:

- The persona and the assessor get only those facts, as data with the check date. They
  follow a rule never to state such a fact from memory, and to say when a fact is
  missing.
- The learner sees when the facts were checked and the official source before the
  activity. After `maxAgeDays` they see an "out of date" warning instead.
- The session page in the Mini App shows the same.

Check every statement against the official source on `checkedAt`, and cite it.

## Fluency

`fluency.fillers` per language (`um`, `ee`, `типа`, `anu`, phrases like `you know`),
`longPauseSeconds` and `pace` (`[minLevel, minWpm, maxWpm]`). With word timestamps from
speech-to-text, the engine measures words per minute, articulation rate, long pauses,
fillers in every listed language, repetitions and a pace verdict. A typed answer gets
fillers per 100 words only.

## Depth standard

The validator rejects a pack that offers a menu action without enough content behind it:

| Content | At least |
|---|---|
| Placement items | 15 |
| Calibration: samples / levels / runs per sample | 8 / 3 / 2 |
| Short speaking questions (with `speaking`) | 30 |
| Cue cards (with a long-turn part) | 8 |
| Role-plays / writing tasks / drills (items each) | 8 / 6 / 6 (5) |
| Reading / listening / practice sets | 4 each |
| Vocabulary or phrase cards | 60 |
| Shadowing sentences / lessons | 30 / 4 |
| Daily reminders / milestones / samples | 5 / 3 / 2 |

## The six coaches

| Pack | Coach | Languages | What it is built from |
|---|---|---|---|
| `ielts` | B1 IELTS Coach | uz/ru/en, practice in English | Speaking Parts 1–3 and mocks, Writing Task 1 and 2 with the ladder, Reading and Listening sets, vocabulary decks. |
| `speaking` | B2 English Speaking Partner | uz/ru/en, practice in English | Role-plays, shadowing, the phrase bank, drills. |
| `maths` | B3 Admission Maths | uz/ru | The subject-core topic graph, 33 topic banks (297 problems, every answer verified by computation in `test/maths-answers.test.ts`), two mini-mocks on a keyed rubric with projections and the percentile, the notebook, photo help, written solutions. |
| `sales` | B4 Sales Coach | uz/ru/en, mixed | 33 buyer personas with hidden budget, pain, decision power and mood, the script builder and own-product buyer, objection drills, DM writing. |
| `career` | B5 Career and Interview | uz/ru/en, mixed | Interview questions and a full mock interview, interview and salary role-plays, visa interviews on dated official facts, CVs, letters and profiles. |
| `speech` | B6 Public Speaking | uz/ru/en, mixed | Pitch, impromptu, story and rehearsal parts with pace, pause and filler numbers, Q&A role-plays, shadowing. |

Not built in: B3 takes its problems from its own banks. Approved items in the Admission
bank (Assessment Cloud) are not read yet; see `docs/product/ai-requests/coach.md`, "Packs".

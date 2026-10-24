# Depth audit: the output skills (writing, speaking, real-life tasks, AI tutor)

Audit date: 2026-10-24, on `main` after PR #301. Scope: what a learner can actually do today in
Writing, Speaking, Real-life tasks (immersion) and the AI tutor, what is shallow or duplicated, and
what this workstream ships. Code paths are relative to the repo root.

## 1. What learners can do today

### Writing (`apps/english-hub/src/skills/writing/`, `supabase/functions/writing-workbench`)
- Open a published writing prompt: brief, checklist, target length, useful words, grammar focus.
- Write in an editor with a live word count. The draft autosaves **to localStorage only**
  (`schood.english.writing.draft.<slug>`). On a new device the page falls back to the last
  *submitted* text, so an unsent draft is lost when switching from phone to PC.
- Submit for feedback (`writing-feedback` AI feature, one credit; rule-based fallback): four
  criteria (task, organisation, vocabulary, grammar) 0-100, strengths, improvements, up to six
  corrections quoted from the text, 1-2 model sentences, checklist coverage.
- Corrections already show a grammar-handbook link (grammar topic) and an L1 note (`L1Why`).
- "Your words": three saved notebook words are suggested; using them counts as a review.
- "Improve your draft": the previous score is kept **in component state only**. The learner sees
  "before 58, now 66" but not *what* changed, nor which criterion moved. Reloading loses it.
- `writing_drafts` + `writing_revision_cycles` are written on every submit, but nothing reads the
  cycles back for the learner (only the legacy `/drafts/*` endpoints, which no UI uses).
- No history of criteria over time, no model answer for the whole task.

### Speaking (`skills/speaking/`, `supabase/functions/speaking-studio`)
- Prompt with cue checklist, prep timer, browser speech recognition (or typing), local audio replay.
- Feedback (`speaking-feedback`): task / vocabulary / grammar scores, pace score from words per
  minute, filler count from the transcript, corrections with `L1Why`, a model answer to listen to.
- Retry: the result shows only `previous_score`. There is no side-by-side comparison of attempts
  and nothing about *how* the answer changed.
- Fluency signals are thin: WPM over the whole Record-to-Stop time and fillers. Browser speech
  recognition usually drops "um/uh", so the filler count is mostly zero; long pauses (the most
  useful signal the browser can honestly give) are not measured at all.
- Useful phrases from feedback cannot be saved to the notebook (only tap-to-translate words can).

### Real-life tasks (`skills/immersion/`, `supabase/functions/immersion-missions`)
- Authored missions of 3-4 steps (read / listen / reply / speak), checked together
  (`immersion-judge` AI feature for replies), cultural note, model answers.
- Missions are identical for every learner: they never use the learner's saved words or recent
  mistakes. Everything happens in one sitting; there is no multi-day work.
- The completion screen is generic (score, "x of y steps"), with no personal summary.
- Tools on the skill home: "Themed week" and "Daily challenge" (AI-generated plans with links;
  nothing is checked or recorded).

### AI tutor (`pages/TutorPage.tsx`, hub `/ai/tutor-chat`, `/tutor/memory`)
- Chat with a server-built `learner_profile` (level, per-skill placement level, goals, recurring
  grammar topics, last 8 results, 5 practice words) and account-level memories (good).
- The conversation lives in **localStorage** (`english-hub:tutor-history:v1`): it does not follow
  the learner to another device or into the installed app on a phone.
- Every turn re-sends up to 12 raw messages of up to 4000 characters plus the profile. This is the
  most expensive English AI call per turn and grows with the conversation.
- The profile ignores the fine-grained ratings (`skill_ratings`), the goal date, how many words
  are due, and any class assignments.
- Suggested actions are free-text routes from the model, filtered client-side only by a regex.
- No structured teaching: the tutor can only talk. There is no "explain, practise, check" loop.

## 2. Shallow or duplicated

| Area | Finding | Decision |
|---|---|---|
| Essay grading | Hub `/ai/essay-grade` (Writing tool "Check any text", `EssayGraderCard`) is a second writing grader with its own rubric (task/coherence/range/accuracy as CEFR labels), no corrections in the text, no L1 links, no history. `writing-workbench` has the validated engine (quoted corrections, grammar topics, L1 notes, rule-based fallback). | Point the Writing tool to a new `writing-workbench` `POST /free/check` that runs the same engine (feature `writing-free-check`). Hub `/ai/essay-grade` stays deployed for older cached clients and is documented as legacy. `EssayGraderCard` stays in `AIIter3Cards.tsx` (no longer mounted). |
| Draft storage | localStorage drafts vs. `writing_drafts` table written only on submit. | Server drafts become the source of truth (autosave endpoint); localStorage remains an offline buffer. |
| Revision history | `writing_revision_cycles` written but never read for the learner. | Read it for draft-vs-draft comparison and criterion deltas. |
| Level examples vs model answer | `RubricCalibrationCard` (`/ai/rubric-calibrate`) writes 3 samples for any prompt the learner types. | Kept as is (different job: comparing levels). The new per-task model answer is cached per prompt and level, so it costs one AI call per prompt/level for everyone. |
| Tutor history | localStorage vs. account memories on the server. | Threads and messages move to the server; the old local history is imported once. |
| Voice conversation vs role-plays | `VoiceConversationCard` (`/ai/voice-conversation-turn`) overlaps with Role-plays (`hub/practice.ts`, scored). | Out of scope here (no change); noted for the owner. |
| Speaking `previous_score` | Read from `speaking_attempts.feedback_json` (version 2 only). | Previous attempt now read from `learning_attempts` (full transcript, stats, fluency) so comparisons work for all attempts. |

## 3. What this workstream ships

**Writing**
- Server-side drafts with autosave (`POST /writing-workbench/prompts/:slug/draft`), resume on any
  device; the newer of the device copy and the account copy wins.
- Revise and resubmit: side-by-side word diff of the previous draft and the new one, and the score
  change per criterion (from `writing_revision_cycles`).
- Criteria history over time (`GET /writing-workbench/rubric-history`) on the Writing home and the
  result, drawn as small inline SVG lines (no chart library).
- A short model answer at the learner's writing level + 1, only after a first submission, cached
  per prompt and level (`english_writing_model_answers`, feature `writing-model-answer`).
- Notebook words to use: still three, now also sent to the AI so the vocabulary comment can count
  them, and shown as "used x of y" in the feedback.
- Every correction already links to its L1 note and handbook rule; the free check gets the same.

**Speaking**
- Retry the same prompt and compare: scores, pace, pauses, fillers and the transcripts side by side.
- Fluency from browser timing: words per minute, long pauses (> 2.5 s with no new words), time to
  first word, fillers, with an honest note that browser timing is approximate.
- Save useful phrases from corrections and the model answer to the notebook.

**Real-life tasks**
- Missions show "your words" (saved notebook words, credited as reviews when used) and "watch out"
  items (the learner's recent mistakes, with L1 notes); the result says which words were used and
  whether a watched mistake came back.
- Multi-day projects (plan a weekend trip, apply for a part-time job, organise a birthday dinner):
  one step per learner day, each day builds on the previous answer, checked by the same judge
  (feature `immersion-project-judge`), and a completion summary across the days.
- Clearer completion summary for missions (steps, personal targets, next step).

**Tutor**
- Server-side threads (`english_tutor_threads`, `english_tutor_messages`) on every device, with
  retention limits (200 messages per thread, 20 threads per learner, 180 days idle).
- Personal context: ratings per skill, goal and goal date, top mistake patterns, words due, current
  class assignments when that table exists; shown to the learner in a "What your tutor knows" panel.
- Low cost: a rolling summary plus the last 6 messages (each cut to 500 characters) instead of 12
  raw messages.
- Structured mini-lessons (`POST /hub/tutor/lesson`, feature `tutor-lesson`): explain, practise 3
  items, check; answers are checked on the server without AI; lessons for grammar topics are cached
  per topic and level.
- Suggested actions are validated on the server and topped up with deterministic deep links
  (due words, the lesson for the top mistake, an active project, an assignment).

## 4. Where it lives (as shipped)

| Area | Server | App |
|---|---|---|
| Writing | `writing-workbench/depth.ts` (draft, model-answer, rubric-history, free/check), submit returns `previous_revision`; pure rules in `_shared/english-writing-depth.ts`, `_shared/english-text-diff.ts` | `skills/writing/useDraftSync.ts`, `Depth.tsx` (RevisionCompare, RubricHistory, ModelAnswer), `Feedback.tsx`, `FreeCheck.tsx` |
| Speaking | `speaking-studio`: `fluency` on submit, `previous_attempt`, `GET /prompts/:slug/attempts`; `_shared/english-fluency.ts` | `skills/speaking/capture.ts` (timeline), `Depth.tsx` (FluencyPanel, AttemptCompare, LastTries), `components/SavePhrase.tsx` |
| Real-life tasks | `immersion-missions/personal.ts`, `projects.ts`; `_shared/english-immersion-depth.ts` | `skills/immersion/Personal.tsx`, `Projects.tsx` (`/immersion/projects/:key`), mission summary in `Mission.tsx` |
| Tutor | `hub/tutor.ts` (threads, context, chat, lessons, memory); `_shared/english-tutor.ts` | `pages/TutorPage.tsx`, `components/tutor/MiniLesson.tsx`, `lib/tutor.ts` |
| Shared UI | | `components/TextDiff.tsx`, `depth.css`, strings in `i18n/depth.{en,ru,uz}.ts` |

## 5. Known limits and open questions

- Pause timing comes from when browser speech recognition delivers words; it is shown as a rough guide, never scored. Typed answers have no pause data.
- The "watch out" result is literal: it only says a mistake was repeated when the learner's own wrong phrase appears again.
- Class assignments: the tutor reads `english_class_members(class_id, user_id)` and `english_class_assignments(class_id, title, skill, route|slug, due_at|due_on, status)` if they exist. The classes workstream should confirm these names.
- Account erasure: the migration appends `english_tutor_messages`, `english_tutor_threads` and `english_immersion_project_runs` to `account_personal_erasure_tables()` (additive, like `20261010175000_ai_request_ledger.sql`). Batch 1 English tables (leagues, badges, review log) are still not in that registry; worth a separate fix.
- Not changed: Voice conversation (`/ai/voice-conversation-turn`) still overlaps with Role-plays; the free text check is not recorded as an attempt (by design, so pasted texts cannot farm XP).

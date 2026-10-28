# Depth audit: the input skills (reading, listening, vocabulary, grammar)

Written 2026-10-24 from the code as it is on `main` after PR #301. "Today" below means before this workstream; the last section lists what this workstream ships.

## Reading (`apps/english-hub/src/skills/reading`, `reading-articles`, `_shared/english-reading.ts`)

What a learner can do today
- Open one of ~24 library texts (A1–C2), read with tap-to-translate, switch to "pick words" mode and save a word with its sentence to My words.
- Answer 4–5 multiple-choice questions per text (detail / main idea / inference / words in context). Answers are checked on the server; wrong ones go to Review; results are grouped by sub-skill with a tip each.
- Read three sentences aloud after finishing.

What is shallow
- **One question type.** Every question is 4-option MCQ. IELTS/CEFR reading relies on True/False/Not given, matching headings and summary (gap) completion; none of these exist, and the studio schema only accepts `type: "mcq"`.
- **No reading speed.** `time_spent_seconds` is sent, but includes answering time and is never turned into words per minute or shown over time.
- **Saved words are forgotten.** A word saved last week is not marked when it appears in a new text; the "saved" highlight only covers words saved in this visit.
- **No vocabulary harvest.** After reading, the learner has to hunt for unknown words themselves; there is no "which of these words were new?" step.
- **No next-text advice.** The result says nothing about whether the level was right; the next text is the generic "up next".

## Listening (`skills/listening`, `listening-content`, `_shared/english-listening.ts`)

What a learner can do today
- Play a script with browser speech (normal or slow), or the audio file when an item has one; answer MCQ questions; write two dictation sentences (each playable normal/slow). Dictation is aligned word by word (contractions, numbers, spelling slips) and shown as a diff; missed words can be saved.
- See the transcript after checking; read-instead mode when the browser cannot speak.

What is shallow
- **Two speeds only**, and the accent is fixed by speaker order (US first speaker, UK second); no learner choice.
- **No segment replay.** `listening_segments` are already sent to the browser but unused outside dictation; a learner cannot replay "just that sentence" while answering.
- **No gist-then-detail.** All questions are shown at once, so learners read questions instead of listening for the main idea first.
- **Dictation feedback is a diff, not advice.** It never says *what kind* of thing was missed (small words, word endings, contractions, numbers, spelling).
- The transcript after checking is one block; it is not tied to segments.

## Vocabulary (`skills/vocabulary`, `vocabulary-notebook`, `vocab-drill`, `telegram-app`)

What a learner can do today
- Learn a topic deck (~10 words): choose the word for a meaning, see translations, add the deck to My words.
- Review My words as flashcards on Review (see word → reveal → "again" / "got it"), in the Telegram Mini App English tab and in the Telegram quiz.
- Words used in writing/speaking count as a review.

What is shallow
- **Scheduler.** A 5-box Leitner (1, 2, 4, 8, 16 days), binary grading, no per-card memory. A hard-won word and an easy one are scheduled the same; nothing goes beyond 16 days. The same box logic is copied in four places (notebook, Telegram app, Telegram quiz, writing/speaking credit).
- **Two word stores.** Platform `/vocab-drill` and the Mini App "Practice" tab (`vocab_next` / `vocab_review`, Telegram `/drill`) use `vocab_drill_cards` (SM-2, a 120-word IELTS AWL deck). The English notebook (`user_vocabulary_notebook_entries`) is separate. A learner sees different words and due counts depending on where they look, and reviews in one place never count in the other.
- **Recognition only.** Every review is "see the word, do you know it?". No typed recall, no spelling from audio.
- **No word knowledge beyond a definition.** No collocations, no word family, and the sentence where the learner met the word is kept but other encounters are not.

## Grammar (`skills/grammar`, `grammar-remediation`, `_shared/english-grammar.ts`, handbook)

What a learner can do today
- 34+ units A1–C2, each with an explanation, contrast and examples, and ~6 typed items (4 gap-fill + 2 error correction), checked on the server with fair typo handling. Wrong items go to Review. Passing a unit marks matching writing/speaking mistakes as practised. A trilingual handbook and first-language (RU/UZ) notes exist.

What is shallow
- **Two drill types.** `transformation` is allowed by the schema but unused; there is no word-order practice at all.
- **No mastery.** A unit is "done" after one attempt; nothing distinguishes 50% once from 90% three times over a month, and nothing brings a unit back later to check it stuck.
- **Mistakes in the lesson are dead ends.** A wrong answer shows the right answer but no link to the handbook rule or to the RU/UZ note explaining *why* this learner gets it wrong.

## Cross-cutting

- No daily, level-matched new text: the reading library is finite and the same for everyone.

## What this workstream ships

### Vocabulary
- **FSRS scheduler** (`_shared/english-srs.ts`, tested): per-card stability and difficulty, four grades, a forgotten card returns after 10 minutes, intervals up to a year. One function (`notebookReviewPatch`) is used by every place a word is reviewed; old Leitner rows and SM-2 drill cards are given a starting state.
- **One word store** (`_shared/english-word-store.ts`, migration `20261026140000`): the notebook is the source of truth; `vocab-drill`, Telegram `vocab_next` / `vocab_review` and the bot's `/drill` read and write it with unchanged response shapes. Learners who used the old drill keep their cards and schedule.
- **Review modes** (Review page and new `/vocabulary/practice`): flashcards with Again / Hard / Good / Easy and the next interval on each button; **typed recall** (meaning, translation and the learner's own sentence with a gap; typo-tolerant); **listen and type** (browser speech).
- **Word knowledge**: collocations and word families on deck words (migration `20261026140100`, four sets authored, studio accepts them), shown when learning a set and in review; **the learner's own example sentences**: every time a saved word appears in a text they read, a recording they hear or the story of the day, that sentence is kept (five newest).
- My words shows how well each word is known and when it comes back.

### Reading
- **New question types** (backward compatible, tested): True/False/Not given and Yes/No/Not given, matching headings (paragraphs numbered in the text), gap-fill summaries with or without a word bank; scored per point; wrong ones come back in Review. Added to six library texts (migration `20261026140200`). Studio and admin editor accept them.
- **Reading speed**: timed from opening the text to "Done reading" or the first answer; words per minute stored per attempt, judged against the level, and a speed panel on the reading home (recent median, change, speed × understanding).
- **Saved words highlighted** in every text (any inflected form).
- **New-word harvest** after reading: less common words from the text (not names, not already saved) to tick and save with their sentence.
- **What to read next**: re-read now (with the text after it), easier, same level or harder, picked from unread library texts.

### Listening
- Four speeds; **accent choice** among the voices the browser really has (US/UK/Australian/Indian).
- **Gist then detail**: main-idea question after the first listen, then details (seven recordings tagged, others use their first question).
- **Sentence-by-sentence replay** while answering (no text) and after checking (with text and tap-to-translate).
- **Specific dictation advice**: small words, word endings, contractions, numbers, spelling, misheard and extra words, with the learner's own examples and a tip each.

### Grammar
- **Word order** (new drill type) and **sentence transformation** items for 18 units A1–C2 (migration `20261026140400`).
- **Unit mastery** (new → started → practising → secure → mastered) with **spaced re-checks** after 3, 10, 30 and 60 days; forgetting sets a unit back. Due re-checks show on the grammar home, in the lesson and in "Up next".
- **Every wrong answer in a lesson links** to its handbook rule, the topic's rules and the Russian/Uzbek first-language note.

### Story of the day
- One new short story per CEFR level per day, written once through the AI gateway (`daily-story`) under a lock, cached for everyone, with a reading-library fallback; browser audio, tap-to-translate, saved-word highlights, three questions, reading speed and the word harvest; a Today card and a `/stories` page with an archive.

### Not done / open
- Collocations and word families are authored for four vocabulary sets only; the rest show none until content is added.
- New reading question types are in six texts; more should be authored in the studio.
- Reading speed is self-timed in the browser; a learner who leaves a text open gets no speed for it (timings outside 30–700 wpm are ignored).

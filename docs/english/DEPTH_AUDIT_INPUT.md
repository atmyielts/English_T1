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

See the end of this file (updated when the work landed).

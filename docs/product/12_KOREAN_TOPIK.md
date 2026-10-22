# V-KO — Korean (TOPIK and EPS-TOPIK)

| Field | Value |
|---|---|
| ID | V-KO |
| Status | idea |
| Priority | P2 |
| Depends on | PE-01 language packs (non-Latin script support), PE-02 exam-format registry |
| Channels | B2C (main), B2B Korean language centers |

## Thesis

Korean has two motivated audiences: students aiming to study in Korea (TOPIK) and workers aiming for Korean employment programs (EPS-TOPIK). Both have a clear deadline and a direct financial payoff, which means high willingness to pay. The product is a language pack plus two exam formats.

## Who and why

| Persona | Job to be done | Trigger |
|---|---|---|
| Work-migration candidate, 18–39 | Pass EPS-TOPIK to qualify for the employment program | A test round is announced |
| Student | Reach the TOPIK level required by a Korean university or scholarship | Application cycle |
| Korean center | Track students' mock results, show pass rates | Marketing, retention |

## Target exams (format details `[VERIFY]`)

- **EPS-TOPIK:** the test used for the Employment Permit System. Listening and reading. Confirm the current item count, timing, pass threshold and any skills test.
- **TOPIK I (levels 1–2)** and **TOPIK II (levels 3–6):** listening and reading, plus writing for TOPIK II. Confirm the current scoring and the switch to the internet-based TOPIK where applicable.

## Learner journey (the loop)

1. **Place:** Hangul check, then a short listening and reading placement.
2. **Aim:** "EPS-TOPIK pass by round X" or "TOPIK level N by date".
3. **Daily:** vocabulary (workplace vocabulary for EPS), listening drills, reading, and grammar patterns.
4. **Gap:** per-section score and a vocabulary coverage bar against the exam word list.
5. **Outcome:** a timed mock in the exact format and a pass probability.

## Features

| ID | Feature | MVP? |
|---|---|---|
| V-KO-F1 | Korean language pack: Hangul, vocabulary, grammar patterns | MVP |
| V-KO-F2 | Hangul trainer for absolute beginners | MVP |
| V-KO-F3 | EPS-TOPIK mock simulator (PE-02) | MVP, first exam |
| V-KO-F4 | Workplace vocabulary and safety-language track for EPS | MVP |
| V-KO-F5 | TOPIK I and II simulators | Later |
| V-KO-F6 | AI writing feedback for TOPIK II writing tasks | Later |
| V-KO-F7 | Uzbek and Russian explanations of every grammar point | MVP |

## Reuse map

The same reuse map as V-RU: language-agnostic skill apps (PE-01), learner language profile tables, Assessment Cloud banks and mocks, OpenRouter grading.

## Build list (new work)

1. Korean font, input and text-to-speech support across the skill apps (PE-01 must handle non-Latin scripts and IME input).
2. EPS-TOPIK registry entry and content pack (listening audio is the major cost).
3. Native-speaker audio recordings or a verified TTS voice. `[VERIFY]` quality.

## Content plan

- **Launch:** Hangul course, about 1,500 vocabulary items with audio, 5 full EPS-TOPIK-style mocks. `[ASSUMPTION]`
- **Audio:** recorded by native speakers or a reviewed TTS voice; every clip reviewed.
- **Licensing:** original "in the style of" items only. Do not copy official question banks.

## Monetization (hypotheses)

- **B2C:** a package priced around one test round, with an intensive "final 30 days" tier. `[ASSUMPTION]`
- **B2B:** center seats with a mock league table.

## Done when

- The EPS-TOPIK simulator matches the verified current format.
- Hangul-to-mock journey works on a phone with Korean input.
- Pass prediction is reported with an honest uncertainty band.

## Risks

- **Program changes** (quotas, test rounds, format). Mitigation: watch official announcements; the registry makes format updates data-only.
- **Scam sensitivity:** the work-migration space has fraud. Never imply job placement or official affiliation.

## Out of scope

Job placement, visa services, K-culture content.

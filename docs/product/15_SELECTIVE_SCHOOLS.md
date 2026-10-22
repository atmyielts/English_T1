# V-SEL — Selective-school entrance prep (ages 10–15)

| Field | Value |
|---|---|
| ID | V-SEL |
| Status | idea |
| Priority | P3 |
| Depends on | PE-03 subject engine, V-ADM Math content (reuse), PE-04 |
| Channels | B2C (parents pay), B2B prep centers |

## Thesis

Entrance to Presidential schools and other specialized schools is competitive, and parents spend heavily on preparation. `[VERIFY]` the current selection stages and test content. A child-friendly practice product with strong parent reporting fits Schood's engine and the parent-as-buyer pattern.

## Who and why

| Persona | Job to be done | Trigger |
|---|---|---|
| Parent of a 10–15-year-old | Know if the child can get in and what to practise | Admission announcement |
| Child | Practise without boredom, see progress | Daily routine |
| Prep center | Run mocks and show parents results | Marketing |

## Target exams (`[VERIFY]` all)

- Presidential schools' selection: confirm stages, subjects (math, logic or critical thinking, English, others) and formats.
- Other specialized and lyceum entrance tests; collect a list with official sources.

## Learner journey (the loop)

1. **Place:** a playful diagnostic per subject.
2. **Aim:** target school and admission date (set by the parent).
3. **Daily:** 15–20 minutes, gamified (streaks, levels), age-appropriate.
4. **Gap:** a topic map the parent can understand.
5. **Outcome:** stage-by-stage mocks and a weekly parent report with "what to do this week".

## Features

| ID | Feature | MVP? |
|---|---|---|
| V-SEL-F1 | Math and logic bank for ages 10–15 (reuse V-ADM engine; new content) | MVP |
| V-SEL-F2 | Logic and critical-thinking item types (patterns, sequences, spatial) | MVP |
| V-SEL-F3 | English for young learners (reuse English packs, A2–B1) | MVP |
| V-SEL-F4 | Parent app view and Telegram weekly report | MVP |
| V-SEL-F5 | Gamification: streaks, badges, safe leaderboards | MVP-lite |
| V-SEL-F6 | Stage-format mocks (PE-02) | MVP once format verified |

## Reuse map

PE-03 subject engine, V-ADM Math items (re-levelled), English packs, `parent-report`, Assessment Cloud for center mocks.

## Build list (new work)

1. Child-safe UX: no open chat with strangers, no public leaderboards with real names, guardian consent before data collection.
2. Logic item types in the item model (Assessment Cloud question types).
3. Age-appropriate content pack.

## Monetization (hypotheses)

- **B2C:** a parent subscription for the admission season, plus a mock pack. `[ASSUMPTION]`
- **B2B:** prep-center seats.

## Done when

A parent can see readiness against the verified stage formats, and a child can practise daily on a phone with guardian consent recorded.

## Risks

- **Minors' data:** strictest privacy rules. Guardian consent is mandatory (see 90).
- **Pressure on children:** avoid anxiety-inducing design. Show progress, not rankings by default.
- **Format secrecy and change.** Rely on verified public information only.

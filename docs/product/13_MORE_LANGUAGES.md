# V-LANG — More languages (German, Turkish; others later)

| Field | Value |
|---|---|
| ID | V-LANG |
| Status | idea |
| Priority | P3; after V-RU and V-KO prove the language-pack model |
| Depends on | PE-01, PE-02 |
| Channels | B2C, B2B language centers |

## Thesis

Once Russian and Korean run as language packs, each further language should cost content plus a few exam formats, not engineering. Add a language only after its validation gate passes.

## Candidates

| Language | Main motivation | Exams to support (format `[VERIFY]`) | Notes |
|---|---|---|---|
| German | Work, vocational training and study in Germany | Goethe-Zertifikat A1–B2 (modules Lesen, Hören, Schreiben, Sprechen); later TestDaF | Strong motivation: visa language requirements |
| Turkish | Study in Turkey, business | TÖMER-style certificates, YÖS-related Turkish | Close to Uzbek, so fast learner progress |
| Japanese | Study and work programs | JLPT N5–N1 | Smaller volume; validate first |
| Arabic | Religious study, Gulf work | Varies | Validate demand and format first |
| Chinese | Study, trade | HSK 1–6 | Validate first |

## Per-language checklist (copy this when adding one)

1. Validation gate passed (01_PORTFOLIO).
2. `languages` row and `products` rows created.
3. Language pack: CEFR-tagged items per skill, grammar taxonomy, writing and speaking rubrics, TTS and STT quality check.
4. At least one exam format in the PE-02 registry, with source and checked date.
5. AI feedback evaluated against human markers on at least 50 samples per productive skill.
6. uz, ru and en explanations; parent report; center bundle in Assessment Cloud.
7. Launch metrics instrumented (00_PRINCIPLES).

## Done when

A new language launches with no new app and no changes to skill-app code. Only data, content, prompts and registry entries change. If code changes are needed, fix PE-01 instead.

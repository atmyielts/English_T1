# SAT tutor customer boundary

The tutor reviews questions from the signed-in learner's completed drill and its immutable result snapshot. A bank question ID alone cannot unlock an explanation. The learner's saved answer supplies answer review; browser-supplied answer text is ignored.

Requests use the existing atomic AI ledger, a shared daily allowance, and a service cap. Only the dedicated AI add-on qualifies for the higher allowance. A request receipt survives response loss and reload, and recovery reads the saved result without submitting another grading request. Account changes discard late responses and isolate receipt storage.

The interface presents readable explanation steps, the original question, the saved solution, and clearly labelled unverified generated examples. Provider failures use fixed customer recovery messages. Provider calls have input, output, body and time bounds, with no automatic model fallback or retry.

## Local evidence

- 18 transport, handler and receipt tests passed.
- 26 isolated PostgreSQL ledger checks passed, including simultaneous SAT quota reservations and private result replay.
- 32 existing SAT completion, answer, bank, startup and saved-feedback contracts passed.
- 23 existing coaching and capacity tests passed.
- Eight Chromium journeys passed, including response-loss recovery, double-click protection, malformed feedback, unavailable quota and a real SDK account switch.
- The tutor was checked at 320, 390 and 1280 pixels with no horizontal overflow or scoped WCAG A/AA violations. The mobile result was visually inspected.
- SAT app build passed. Browser fixtures blocked all external traffic and made no production or provider requests.

## Publication and remaining qualification

The frontend must pass hosted CI and publish through the normal PR merge. Deploy only the reviewed `sat-practice` function bundle afterward; no migration is required. The updated UI requires the v2 quota contract before submitting a tutor request, so frontend-first publication fails closed.

Leave `SAT_TUTOR_SERVICE_DAILY_LIMIT` unset or zero, preserve the existing provider configuration, and leave the dedicated add-on unconfigured. Local fixtures do not establish real provider feedback quality. Verify published source identity, JWT configuration, owned incomplete/unrelated drill denial and result recovery before enabling a positive cap. Existing drills, scores and saved first-party solutions remain available.

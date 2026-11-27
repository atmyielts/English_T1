# English Hub learning architecture

**Status** Platform architecture with the Grammar checks, two cross-skill pathways, mapped practice and new projects implemented on the feature branch.

**Date** 27 November 2026

**Decision owner** Schood product owner

## Outcome

An independent learner can open English Hub, see the most useful work they can do now, practise a specific weakness, and later demonstrate the ability in a different context. The Hub can explain each recommendation and show the observations behind each claim. A lesson, an assessment and a level estimate each serve a different purpose.

Schood’s work, study and everyday paths will use observable communicative outcomes aligned to relevant CEFR descriptors. A Grammar or Vocabulary competency can support several such outcomes. Passing a foundational competency supports a specific claim about that ability. A CEFR band claim requires evidence across the corresponding communicative activities, with coverage and a level policy calibrated separately. [Council of Europe CEFR descriptors](https://www.coe.int/en/web/common-european-framework-reference-languages/cefr-descriptors)

## System boundaries

| Responsibility | Owner | Contract |
| --- | --- | --- |
| Content and prerequisites | Curriculum | Stable competency identifier and one observable outcome. Publish a reviewed revision with supported skills, expected level, practice material, assessment criteria and eligible task families. Prerequisites normally order recommendations. Direct access stays available within the learner’s plan. |
| Practice and feedback | Existing skill services | Record source activity and errors. A reviewed rule or rubric mapping identifies which competency an error may indicate. Feedback provides examples, specific corrections and a route to practice. Completion and model feedback are records of practice. |
| Independent assessment | Assessment endpoint and database | The server selects an unseen task family at the appropriate stage, applies the registered key or calibrated rubric, and commits the evidence and stage transition in one transaction. Each result identifies the learner, competency, task revision, criterion outcomes, scoring policy, and assessment time. |
| State and recommendations | Hub | Read the current assessment state, the evidence behind it, and ordinary practice history. Apply a deterministic policy to the learner’s goal, entitlements, available content and current obligations. Today renders the due assessment alongside the daily plan. Up Next ranks the same assessment against other actions. |
| Explanation and conversation | Tutor | Explain the recommendation, help learners practise and link to actions the server can open. The tutor can cite observed mistakes and give feedback. Independent evidence enters through the assessment contract. |

Postgres stores durable learner evidence. Supabase Edge Functions use the existing authenticated skill and Hub entry points. The first slice uses exact scoring and an indexed due query with zero per-request model calls. At that boundary, an absent or unavailable evidence projection yields no assessment recommendation and the current Hub still responds. A stale link resolves against current entitlement and assessment state.

### Learner evidence

| Observation | What it supports |
| --- | --- |
| Completed lesson, replayed question, corrected model answer | Practice history and diagnostic hints. |
| Unseen scenario, unaided response and committed criterion result | Evidence of applying the competency in that scenario. |
| Different held-out task family after the required pause | Evidence of retention at the measured interval. |
| Criterion met independently in multiple task families and modes | Basis for a broader communicative claim once coverage and scorer agreement have been validated. |

Track the strength and age of the evidence separately from the study level and effort. Record attempts before deriving a summary. A duplicate submission returns the original receipt. A failed submission leaves no partial evidence. Account closure erases private learning records even when the billing principal is retained for financial records.

### First delivered policy

1. An initial Grammar check records the starting point and offers the rule and targeted lesson. This unlocks a fresh transfer batch.
2. Passing transfer schedules retention after at least 24 hours of server time. A transfer miss opens the next unseen batch. A retention miss schedules the next unseen retention batch after another 24 hours.
3. Only a due assessment with an available fresh batch can enter the recommendation list. Pick the earliest due assessment with a stable tie break. Entitlement and pause decisions belong to the server.
4. A delayed pass is evidence for that competency and interval. Exhausted items direct the learner back to practice. Published lesson reviews and their existing progress remain available.
5. Up Next keeps resumptions, assignments and due review ahead of the competency check. It ranks an available competency recheck ahead of ordinary mistake drills and reviews of the same lesson. Today renders the same due selection alongside the stable practice plan. The check does not modify the plan’s stored completion counters.

The current Grammar bank has one competency at each level, 30 distinct batches and 60 questions. Batch identity and stored feedback preserve the fixed scoring record. The A2 article-reference Writing pathway and the B1 time-reference spoken-wording pathway each add a baseline, a Grammar prerequisite, a fresh productive task and distinct follow-ups due at least one and four weeks after productive transfer. Each stage has two separate task families. The active family is chosen on the server, and the private result stores its family, rubric version, input mode, check date and observed errors per usable opportunity.

The Writing recommendation comes from a recent first A2 Writing attempt. It uses an exact learner quote and one attributable correction whose changed word is an article. The baseline appears without the correction, and the quote is retained privately with the follow-up. The B1 pathway uses wording from browser transcripts that learners confirm against what they said. Typed rehearsal stays on the page and creates no evidence. These checks measure constrained article or tense choices. Pronunciation, fluency, listening comprehension and broader writing or CEFR scores require separate evidence.

## Alternatives considered

| Option | Effect |
| --- | --- |
| Keep the Grammar feature independent | Quick to release. Today, Up Next and the new check screen could continue showing different priorities, and each future skill would need to solve the same problem. |
| Give each skill a separate mastery implementation | Gives local flexibility. Every service would own a different definition of evidence, privacy, scheduling and completion. Cross-skill transfer and consistent progress reporting would become reconciliation work. |
| Extend the existing Hub with a shared assessment decision and private evidence | Uses the current stack and preserves practice history. The work shifts to curriculum mapping, assessment validity and migration contracts. The first release can exercise the rules on Grammar before introducing a rubric-based adapter. |

Choose the third option. Keep the decision policy deterministic and inspectable. Each rubric-backed scorer can have its own validation and abstention rules. Postgres and Hub remain the shared course of record.

## Build sequence and acceptance

### 1. Define the curriculum and measure inventory

For every supported band, map reception, production, interaction and mediation outcomes to the existing modes and courses. List the prerequisite skills, a diagnostic, targeted practice, a transfer task and a held-out check for each outcome. Grammar and Vocabulary are mapped where learners actually use them. For example, an A2 learner can make a service request from a short notice, a B2 learner can compare two options and defend a recommendation, and a C2 learner can synthesize conflicting accounts while preserving uncertainty and whose claim is whose.

The intensive library maps reception, production, interaction and mediation to 24 existing practice sessions across A1–C2. Six original four-day projects add 24 further practice stages through the existing real-life coursework. The audit below counts expected time from authored activities and their service estimates. A recorded-audio gate excludes pending Listening stages from native mission grading while keeping the other stages available.

```powershell
deno run --no-lock --allow-read scripts/english-content/learning-inventory.ts
```

The target remains 72 hours per band, equivalent to 12 weeks at six one-hour sessions per week. The current estimate is about 64–68 hours per band. Actual time requires learner-session validation. Until Schood’s recordings are available, the Listening scripts remain prepared, and affected sessions display the coming-soon state.

### 2. Deliver one cross-skill path end to end

Start with a specific A2 article-reference error in Writing. Verify that the error quotes the learner accurately and maps to a reviewed Grammar competency without counting as a Grammar assessment result. The Hub offers the diagnostic, assigns practice on the pattern, then uses a different Writing brief containing naturally occurring opportunities to use identifiable and new referents. The held-out brief controls for task difficulty and avoids teaching the expected phrasing. Compare actual errors per opportunity on first and later tasks. Include a useful next action for inconclusive results.

Version the criterion and its task-family mappings before allowing Writing observations into shared evidence. Confirm the same action and claim follow the learner between devices. An old quoted mistake can support a new recommendation only until later evidence resolves it or its freshness window ends.

### 3. Expand to productive skills and multi-week retention

The two initial pathway rubrics use versioned deterministic checks backed by 48 authored positive anchors and explicit negative and ambiguous cases. The checks return inconclusive when the learner uses a construction the assessor cannot classify. An incomplete sample gets a fresh alternate brief, with a further 24-hour wait if the learner saw feedback on a delayed check. A second incomplete sample remains inconclusive and offers a practice route. A submitted family cannot be reused for a score.

Wider assessment still needs human-reviewed anchor samples, double scoring on representative learner responses, and a validated way to estimate agreement, abstention and relative difficulty across variants. Treat the new projects and completed practice as useful work in their own right. These activities do not create independent competency evidence.

Add additional held-out task families for checks after one week and four weeks. Use the results to decide whether an ability still has recent evidence or needs another sample. Track per skill and band the share of learners who complete a fresh transfer attempt, pass a delayed held-out task, and reduce recurring errors in independent work. Report eligible counts and missing outcomes. Establish baselines before committing to improvement targets or making claims about replacing tutoring.

### Release criteria for the first slice

- A production-equivalent paid learner can submit a check and open the next due assessment from Today and Up Next. An unentitled learner cannot open it through a free activity or class.
- A check remains unavailable before the server due time. Paused skills, completed checks and exhausted fresh banks are excluded from due recommendations.
- Concurrent retries produce one receipt and one committed evidence record. A response for a different learner or a different stage is refused.
- Today and Up Next still load during the additive rollout. A recommendation failure preserves ordinary practice, and rollback preserves the accumulated evidence.
- Coverage stays described as six assessed competencies. Broader levels and proficiency claims require their own validated coverage and evidence.

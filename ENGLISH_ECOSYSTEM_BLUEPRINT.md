# English Ecosystem Blueprint

This document is the target-state engineering blueprint for the non-exam English ecosystem.

Use this alongside [ENGLISH_SERVICES_ARCHITECTURE.md](C:\Users\MuhammadJa'far\AntiGravityProjects\English_T1\English_T1\ENGLISH_SERVICES_ARCHITECTURE.md:1):
- `ENGLISH_SERVICES_ARCHITECTURE.md` = current-state repo audit
- `ENGLISH_ECOSYSTEM_BLUEPRINT.md` = target-state build spec and roadmap

## 1. Target Operating Model

The English portfolio should operate as one connected ecosystem, not as isolated apps.

The system should do five things consistently across all English services:
- assess the learner at skill and subskill level
- teach with structured tasks instead of disconnected screens
- correct with explicit feedback and retry loops
- remember vocabulary, mistakes, mastery, and progress across services
- adapt future work based on real learner performance

Operating model:
- `english-hub` orchestrates daily work and service handoffs
- skill services own learning workflows for their domain
- shared-core services own attempts, feedback, recommendations, mastery, and shared profile state
- `english-vocabulary` remains a shared memory layer for all services
- English stays language-scoped so the platform can expand beyond English later

## 2. Shared Data Model

All English services should write into one shared learning model.

### 2.1 Learner Language Scope

One learner profile per user and language should include:
- `user_id`
- `language_id`
- `language_code`
- current CEFR estimate
- target CEFR
- learner goals
- daily time preference

### 2.2 Skill and Subskill Profiles

Shared skill profile fields:
- reading score
- listening score
- writing score
- speaking score
- grammar score
- vocabulary score

Subskills should be tracked explicitly.

Examples:
- reading: gist, detail, inference, reference, speed
- listening: word recognition, dictation accuracy, detail recall, reduced-form decoding
- writing: grammar accuracy, sentence control, coherence, lexical range
- speaking: pronunciation, fluency, grammar control, task completion
- grammar: tense, articles, prepositions, agreement, word order
- vocabulary: recognition, recall, usage, collocation, retention

### 2.3 Shared Learning Entities

The shared-core schema should support:
- content item
- learning attempt
- attempt feedback
- learner error memory
- mastery state
- recommendation queue
- daily plans
- learner goals

### 2.4 Shared Tables

Core shared tables:
- `learning_content_registry_items`
- `learning_attempts`
- `learning_attempt_feedback`
- `learner_language_errors`
- `learner_language_mastery`
- `learner_language_recommendations`
- `learner_language_daily_plans`
- `learner_language_goals`

Existing shared platform/language tables to reuse:
- `languages`
- `product_languages`
- `language_signals`
- `learner_language_profiles`
- `language_lexicon_entries`
- `user_vocabulary_notebook_entries`
- `reading_articles`

### 2.5 Hybrid Persistence Strategy

The platform should keep its generic runtime foundation:
- `sessions`
- `responses`

Those remain useful for universal task runtime history.

But English services also need richer learning tables for:
- retries
- task scoring
- structured feedback
- mastery state
- recommendation queues
- remediation workflows

That means the architecture should stay hybrid:
- generic session runtime stays platform-wide
- English learning state gets dedicated tables where deeper product logic needs them

## 3. Shared Backend Services

The shared core should be built first and reused by every English product.

### 3.1 `learning-profile-v3`

This extends the current profile layer without breaking current consumers.

Responsibilities:
- aggregate attempts across all English services
- update skill and subskill scores
- expose learner dashboard data
- summarize recent weak areas
- return service readiness and recommendation summaries

Required outputs:
- skill scores
- subskill scores
- CEFR estimate
- target CEFR
- learner goals
- daily-time preference
- mastery summary
- recent error clusters
- recommendation summary
- service breakdown

### 3.2 `learning-attempts`

Unified attempt ingestion for all English services.

Responsibilities:
- start tasks
- submit tasks
- record retries
- store time spent
- store hint usage
- normalize score calculation
- emit signals into the shared profile layer

### 3.3 `feedback-engine`

Standard learner-facing feedback formatter.

Responsibilities:
- normalize raw service feedback
- keep one response structure across all services
- support rule-based and AI-assisted feedback where needed

Normalized payload:
- `summary`
- `issues[]`
- `retry_task`
- `related_drill`
- `handoff_targets[]`

### 3.4 `recommendation-engine`

Shared decision maker for next-step logic.

Responsibilities:
- generate daily plans
- create recommendation queues
- assign carryover tasks
- emit service handoff suggestions
- balance new work, review, and transfer tasks

Version 1 rule:
- use explicit rules first
- do not hide logic behind vague personalization

### 3.5 `mastery-engine`

Responsibilities:
- track whether a unit is `new`, `learning`, `unstable`, `stable`, or `mastered`
- decay confidence over time
- reopen mastery after repeated failure
- support transfer validation in writing, speaking, and immersion

### 3.6 `content-registry`

Responsibilities:
- register all service content under one metadata model
- track level, tags, dependencies, objective, and service ownership
- let the recommendation engine discover tasks across services

Every content item should have:
- service
- skill
- subskills
- CEFR
- difficulty
- estimated minutes
- learning objective
- tags
- prerequisites or dependencies

### 3.7 `vocabulary-notebook`

This remains a shared backbone, not just a standalone app API.

Responsibilities:
- capture vocabulary from any English service
- keep learner-scoped memory and review history
- power due review and activation tasks
- feed recommendations back into reading, listening, writing, speaking, and immersion

## 4. Shared Scoring And Mastery Rules

### 4.1 Task Score Contract

Each attempt score should combine:
- correctness
- retry penalty
- time efficiency
- hint usage
- correction quality

Objective tasks should score deterministically.
Writing and speaking can use hybrid evaluation:
- rule-based checks first
- bounded AI-assisted evaluation where needed

### 4.2 Weighted Subskill Updates

Every attempt must update one or more subskills with explicit weights.

Example:
- dictation task updates listening word recognition
- dictation task updates listening detail accuracy
- dictation task updates vocabulary recall

The system must not collapse all learning into one generic progress bar.

### 4.3 Mastery Rules

Mastery states:
- `new`
- `learning`
- `unstable`
- `stable`
- `mastered`

Promotion rules:
- one good attempt is not enough for mastery
- mastery requires repeated success over time
- repeated failure can reopen a unit
- transfer failure in immersion or production can downgrade mastery

### 4.4 Recommendation Rules

Priority should consider:
- weakness severity
- recency of failure
- due review pressure
- learner goal
- neglected skill balance
- recent workload

## 5. Service-By-Service Product And Backend Contracts

## 5.1 English Hub

Core role:
- daily study planner
- weakness map
- recovery-plan generator
- cross-service launcher
- weekly review surface

Required backend inputs:
- `learning-profile-v3`
- due vocabulary review
- active recommendations
- recent attempts
- mastery gaps

Primary endpoint:
- `GET /hub/plan`

Expected output:
- today plan
- urgent review items
- weakest skills
- suggested focus
- carryover tasks

## 5.2 English Reading

Reading is the first full template service.

Content types:
- graded article
- paragraph focus task
- sentence analysis task
- inference task
- reference resolution task
- vocabulary-in-context task
- summarization task

Key features:
- pre-reading mode
- guided reading mode
- comprehension task engine
- intensive reading mode
- extensive reading mode
- vocabulary capture

Backend contract:
- reading content registered in `content-registry`
- attempts submitted through `learning-attempts`
- reading misses can update vocabulary, grammar, and writing recommendations

## 5.3 English Listening

Listening needs a dedicated content and recovery backend.

Required tables:
- `listening_items`
- `listening_segments`
- `listening_task_sets`
- transcript metadata
- accent metadata
- speed metadata

Key features:
- controlled listening
- dictation
- gap fill
- transcript ordering
- reduced-form identification
- shadow-repeat
- recovery loops after failure

Backend contract:
- listening tasks write structured decoding and comprehension signals
- repeated misses can trigger vocabulary capture, grammar remediation, or speaking pronunciation work

## 5.4 English Writing

Writing should become a correction and revision engine.

Required tables:
- `writing_prompts`
- `writing_drafts`
- `writing_revision_cycles`

Key features:
- drafting workspace
- issue categorization
- staged correction workflow
- rewrite modes
- error notebook
- before/after progress view

Backend contract:
- store draft and revision history
- track issue spans and categories
- score correction ability, not only final draft quality
- emit grammar, vocabulary, and organization handoffs

## 5.5 English Speaking

Speaking needs a structured speaking engine, not only prompt screens.

Required tables:
- `speaking_prompts`
- `speaking_attempts`
- `speaking_transcripts`
- retry comparison data

Key features:
- read aloud
- repeat/shadow
- guided response
- conversation mode
- feedback dashboard
- transcript correction loop

Backend contract:
- track pronunciation, fluency, grammar control, and response quality separately
- emit vocabulary, grammar, and writing-structure handoffs where relevant

## 5.6 English Grammar

Grammar is the remediation engine of the ecosystem.

Required tables:
- `grammar_units`
- `grammar_drills`
- `grammar_remediation_assignments`

Key features:
- diagnosis by error type
- micro-lessons
- drill ladders
- targeted review
- transfer tasks into writing and speaking

Backend contract:
- receive repeated learner errors from other services
- assign focused remediation
- retest after delay
- update mastery once transfer succeeds

## 5.7 English Vocabulary

Vocabulary should evolve from notebook to full lexical system.

Lexical item types:
- single word
- phrase
- collocation
- fixed expression
- phrasal verb
- sentence frame

Per-learner states should track:
- first seen
- source service
- meaning confidence
- recognition score
- recall score
- usage score
- pronunciation score
- review history

Key features:
- capture from all services
- multiple review modes
- context bank
- activation tasks
- confusion-set teaching

Backend contract:
- vocabulary remains shared across all services
- a word is not fully learned until it is used in writing or speaking and later retained

## 5.8 English Immersion

Immersion is the transfer layer.

Required tables:
- `immersion_missions`
- `immersion_mission_steps`
- `immersion_mission_attempts`

Key features:
- scenario missions
- mixed-skill task flows
- decision points
- mission debrief
- integrated evidence from multiple services

Backend contract:
- mission containers orchestrate reading, listening, speaking, writing, and vocabulary checkpoints
- immersion failures can reopen mastery that looked stable in isolated drills

## 6. Interconnection Rules

Connections between services should be explicit and rule-driven.

### 6.1 Reading
- unknown useful word -> vocabulary
- repeated structure confusion -> grammar
- good comprehension but weak summary -> writing
- article topic reused for discussion -> speaking

### 6.2 Listening
- missed words -> vocabulary
- missed grammar forms in audio -> grammar
- shadowing failure -> speaking pronunciation track
- good comprehension but weak decoding -> more listening recovery, not reading

### 6.3 Writing
- repeated grammar errors -> grammar remediation
- weak vocabulary use -> vocabulary activation
- weak organization -> reading model texts and summary practice
- corrected draft followed by oral explanation -> speaking transfer

### 6.4 Speaking
- inaccurate grammar -> grammar
- limited vocabulary -> vocabulary usage tasks
- weak organization -> writing planning tasks
- pronunciation weakness on saved vocab -> vocabulary pronunciation review

### 6.5 Grammar
- after drill mastery, require application in writing or speaking
- surface target patterns inside reading and listening

### 6.6 Vocabulary
- due cards affect daily plan
- mastered words become target words in writing and speaking
- weak retention triggers easier recycling in reading and listening

### 6.7 Hub
- balances workload across services
- prevents over-focus on one skill
- combines review, remediation, and transfer
- generates daily and weekly plans

## 7. Phased Implementation Roadmap

### Phase 1
- add shared-core tables
- ship `learning-profile-v3`
- ship `learning-attempts`
- ship `feedback-engine`
- ship `recommendation-engine`
- ship `mastery-engine`
- ship `content-registry`
- wire `english-hub` to hub plan + recommendations + profile v3
- route `english-reading` attempts into `learning-attempts`
- connect vocabulary due review into hub daily plan

### Phase 2
- add listening content backend
- add writing prompt/draft/revision backend
- emit structured listening and writing signals into shared core

### Phase 3
- add speaking prompt/transcript/scoring backend
- add grammar unit/drill/remediation backend
- make grammar the repair service fed by production errors

### Phase 4
- add immersion mission backend
- validate whether isolated mastery transfers into realistic use

### Phase 5
- promote recommendation thresholds into admin-tunable rules
- add analytics for handoff effectiveness, mastery reopening, vocab activation, and transfer quality

## 8. Acceptance Criteria

The implementation should be considered structurally successful when:
- every English service can register content into one shared content registry
- every learner task can write a canonical attempt record
- every attempt can produce normalized learner-facing feedback
- the shared profile can summarize skill and subskill performance
- the hub can generate a daily plan from shared recommendations and vocabulary review
- grammar remediation can be triggered by repeated errors from other services
- vocabulary can flow into later writing or speaking activation tasks
- immersion outcomes can validate or reopen mastery

## 9. Version-One Rule Set

Daily plan rules:
- always include due vocabulary review
- always include one highest-severity weakness task
- always include one transfer or application task
- respect learner daily time budget

Fixed handoff thresholds for v1:
- repeated grammar error 3 times in 7 days -> grammar remediation assignment
- vocab saved but not used correctly after 5 days -> vocabulary activation task
- listening dictation accuracy below 70 percent twice on the same pattern -> controlled listening recovery task
- low writing revision success across 3 tasks -> simpler guided writing task
- weak speaking grammar while grammar drills are already stable -> speaking transfer task instead of more grammar explanation

## 10. Test And Verification Requirements

Test plan:
- migration and RLS tests for all new shared-core tables and service tables
- contract tests for `learning-profile-v3`, `learning-attempts`, `feedback-engine`, `recommendation-engine`, and `GET /hub/plan`
- idempotency tests for attempt submission, signal emission, recommendation rebuilds, and vocabulary capture
- acceptance scenarios for reading -> vocab -> hub, writing -> grammar remediation, listening recovery, mastery reopening, and vocabulary activation
- regression coverage for existing `reading-articles`, `vocabulary-notebook`, and current `learning-profile-v2` consumers during rollout

This blueprint is the target-state spec for building the non-exam English ecosystem in structured phases without losing compatibility with the current platform.

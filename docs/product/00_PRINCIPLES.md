# 00 — Product principles (apply to every vertical)

## North star

"Tell me where you want to get to, and I'll give you the next 20 minutes that move you there, every day, until you arrive." This is the English masterplan's north star, generalized to every subject and language. `[DECIDED]`

## The one loop every vertical implements

`Place → Aim → Daily → Gap → Outcome`

| Step | What the learner experiences | What the product must have |
|---|---|---|
| Place | A short diagnostic tells them their current level | A placement test per subject or language, mapped to a level scale (CEFR, exam band or score) |
| Aim | They pick a goal: exam, target score, date | A Goal record (`learner_language_goals` for languages, a subject equivalent for others) |
| Daily | The home screen shows the next best 20 minutes | The daily planner (`learner_language_daily_plans` pattern) driven by mastery and errors |
| Gap | They watch weak areas close | Per-skill or per-topic mastery (`learner_language_mastery` pattern) and an error log |
| Outcome | Mock exam, predicted score, then the real result | Full timed simulator, score prediction, a certificate or result record |

A vertical that lacks Place or Daily is a content library, not a Schood product. Do not ship one. `[DECIDED]`

## Audiences and channels

| Channel | Who pays | What they buy | Existing surface |
|---|---|---|---|
| B2C | The learner, or a parent for under-18s | Subscription per vertical, exam packs, AI grading credits | `apps/platform`, Click checkout, Telegram bot |
| B2B centers | Education centers | Seats for their students, ready-made tests, reports | `apps/academy`, Assessment Cloud |
| B2B institutions | Schools, universities, employers | Placement and assessment at scale | Assessment Cloud, Proctor |

Every vertical must say which channels it serves and how it is priced in each. `[DECIDED]`

## Market defaults (Uzbekistan first)

- **Interface languages:** Uzbek, Russian and English for every learner-facing screen. `[DECIDED]`
- **Telegram first:** reminders, results, daily nudges and parent reports go through the Schood bots before email. `[DECIDED]`
- **Parents are buyers:** for learners under 18, every vertical needs a parent report (reuse `parent-report`). `[DECIDED]`
- **Payment:** Click through the existing `entitlements` path. Prices are in UZS. `[DECIDED]`
- **Mobile-first:** design for a 360–390px phone on a weak connection. Desktop is secondary for learners and primary for centers. `[ASSUMPTION]`

## Reuse rules (engineering, enforced in review)

1. **No new app per subject.** Languages become language packs on language-agnostic skill apps (`PE-01`). Exams become formats in the exam-format registry (`PE-02`). Non-language subjects use the subject engine (`PE-03`).
2. **Assessment Cloud is the content and test engine.** Any new question bank, mock exam or placement test is authored, reviewed and delivered through it. That also lets centers use the same content (B2B for free).
3. **AI grading stays human-overridable.** Reuse the OpenRouter grading path. AI suggests and explains, humans can review, and AI never silently changes a released score.
4. **Entitlements, not hardcoded access.** Every vertical is a `products` row with `entitlements` limits. Never gate access in the frontend only.
5. **Content quality beats volume.** Every published question has passed independent review (the Assessment Cloud review flow). Never ship AI-generated content without human review.

## Content rules

- **Original or licensed only.** Do not copy official past papers unless their licence allows it. Write "in the style of" items and record the source and licence on every item. `[DECIDED]`
- **Format fidelity:** simulators must match the current official format (sections, timing, question types, scoring). Every format detail starts as `[VERIFY]` until checked against the official source.
- **Level mapping:** every item carries a level tag (CEFR, exam band or grade) and a topic, so Place and Gap can work.

## Pricing frame (hypotheses until validated)

- **B2C:** a monthly subscription per vertical, plus one-off mock exam packs. Price anchor: a fraction of one month of a center's tuition for the same subject. `[ASSUMPTION]`
- **B2B centers:** per active student per month, or a center plan with a seat cap. `[ASSUMPTION]`
- Any number in these docs is a hypothesis to test, not a published price.

## Success metrics every vertical reports

- **Activation:** % of sign-ups who finish Place and set an Aim within 24h.
- **Habit:** weekly active days per active learner, and the D7 and D30 retention curves.
- **Learning:** mastery gain per 10 hours, and mock-score delta from the first to the latest mock.
- **Revenue:** paid conversion within 14 days, monthly churn, ARPU, and revenue minus content and AI cost per learner.
- **Outcome:** real exam result vs prediction (self-reported or certificate upload). This is the claim marketing is allowed to make, and only with evidence.

## Hard "don'ts"

- Do not promise scores, admission or jobs. Report real outcome evidence only.
- Do not collect more personal data than the vertical needs. Minors' data follows the guardian-consent policy (open item; see 90).
- Do not launch a vertical without the uz/ru/en interface, a parent report (if under-18), and a placement test.

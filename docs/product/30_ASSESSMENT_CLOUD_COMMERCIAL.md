# 30 — Assessment Cloud and Proctor: will they make money, and how to sell them

Engineering status and release gates live in [docs/assessment-cloud](../assessment-cloud/README.md). This doc covers the business side only.

## Verdict

- **Assessment Cloud** can be profitable with education centers, at low cost, if it is sold bundled with Schood content and reaches centers through Academy. `[ASSUMPTION]`, to be validated with paying centers.
- **Proctor** sold to the same centers will likely not pay for itself, because centers mostly test in person. Its real buyers are universities, employers, certification bodies and online schools, which need longer sales cycles. `[ASSUMPTION]`

## Why Assessment Cloud can work

- **Low variable cost:** text and choice exams cost cents per candidate on Supabase and Cloudflare. The main cost is founder time.
- **Distribution:** centers already in Academy mean a near-zero cost to acquire each customer.
- **Moat:** ready-made, reviewed content (placement tests, mock IELTS, SAT and TOEFL papers, and later Russian, Math and the other verticals). Generic form tools can't match it. Sell "tests that are already written and auto-marked", not "a tool to write tests".

## Why Proctor is weak with centers

- Centers run their mocks in their own rooms, with a teacher watching.
- Recording, storage and live video cost money per proctored hour. A rough estimate is $0.05–0.20 per hour `[ASSUMPTION]`, which is fine only if someone pays per sitting.
- Recordings and ID checks, possibly of minors, raise the data-localization question (see 90). If local hosting is required, that adds a fixed cost.

## Rough break-even (illustrative, replace with real data)

| Item | Assumption |
|---|---|
| Fixed cash cost (production, staging, scanner, static-IP VPS, mail, domains) | $300–600 per month |
| Center price for Assessment Cloud plus content | $25–40 per center per month |
| Paying centers needed to cover fixed cash cost | about 15–25 |
| Proctor price | $1–3 per proctored sitting; cost $0.05–0.20 per hour |

This excludes founder time. The real profitability test is revenue minus hosting minus support hours, measured per center.

## How to package and sell

| Package | Buyer | Contents | Pricing shape `[ASSUMPTION]` |
|---|---|---|---|
| Center Essentials | Language and prep centers | Assessment Cloud, the Schood content library, auto-marking, reports for students and parents | Monthly per center, with student seats |
| Center Pro | Larger centers | Plus their own banks, analytics, certificates, multiple branches | Higher monthly tier |
| Proctor add-on | Centers that run remote sittings | Record-and-review proctoring | Per sitting |
| Institution | Universities, employers, certification bodies | Assessment Cloud and Proctor, SSO, an SLA | Annual contract |

## Rules for the product team

1. **Charge from day one,** even a small amount. Free pilots must have a conversion date.
2. **Ship the core first:** banks, tests, marking, results and placement tests. Keep live video, QTI and the native secure clients switched off until a paying customer asks.
3. **Every vertical's content goes into the center library** (00_PRINCIPLES reuse rule 2). That is how verticals and B2B reinforce each other.
4. **Measure per center:** revenue, hosting cost, AI cost and support hours. Report it monthly.

## Open decisions (owner)

- Price points per package (needs 5–10 center interviews).
- Whether Proctor targets an institution segment now or waits for inbound demand.
- Hosting location for recordings and identity data (legal input required).

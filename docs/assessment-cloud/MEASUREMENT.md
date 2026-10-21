# Measurement cores: uncertainty, DIF, calibration and equating

Status 2026-10-22: **pure, tested library code; not yet wired into reports or forms.** Backlog: `STAT-03`, `STAT-04`, `STAT-05`, `FORM-05`. These are tools for reviewed analyses. Nothing here changes a score, form or credential automatically.

| Module | What it computes | Validation |
| --- | --- | --- |
| `packages/assessment-core/src/psychometrics.ts` | Feldt confidence interval for Cronbach's alpha, standard error of measurement, Wilson interval for item facility, Fisher-z interval for item–rest correlation | Normal and F quantiles match printed tables (e.g. F.95(5,10)=3.326, F.975(10,20)=2.774). Wilson 8/10 → (0.4902, 0.9433). Fisher r=.5, n=30 → (0.170, 0.730). |
| `dif.ts` | Mantel–Haenszel α, ETS D-DIF, Robins–Breslow–Greenland standard error, continuity-corrected χ², ETS A/B/C class | Hand-computed strata (α=6 → D=−4.21, class C). A moderate effect gives B; no effect gives A. |
| `rasch.ts` | Joint-maximum-likelihood Rasch difficulties (centred, (L−1)/L corrected), standard errors, infit and outfit; iterative exclusion of extreme items and persons | Seeded simulation of 2,000 persons × 20 items recovers difficulties with RMSE < 0.12 logits; infit is within 0.85–1.15 on model-generated data. |
| `equating.ts` | Linear (mean–sigma) and equipercentile equating for equivalent groups | Exact shift and scale identities; identity for equal forms; monotone. |

Every estimate reports why it is missing instead of inventing a number:
- too few items
- no score or item variance
- negative reliability
- fewer than 30 candidates (`small_sample`)
- fewer than 100 per DIF group (`insufficient_sample`), in which case nothing is computed or disclosed

Tests: `psychometrics.test.ts` and `measurement.test.ts`, run in the `integrations` CI job.

## Remaining work

- **STAT-03:** show intervals and warnings in the analytics screens and report snapshots.
- **STAT-04:** calibration datasets and workflow, with model-fit review, versioned parameters and independent review.
- **STAT-05:** subgroup definitions under an approved access policy, plus disclosure controls in the UI.
- **FORM-05:** equating studies with documented equivalent-group evidence before any comparability claim.

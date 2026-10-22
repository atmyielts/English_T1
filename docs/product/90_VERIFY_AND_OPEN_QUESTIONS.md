# 90 — Must-verify facts and open owner decisions

Nothing here may reach content, pricing or marketing until it is verified with a source link and date. When verified, record it here (the source, date and who checked) and remove the `[VERIFY]` tag in the vertical doc.

## Exam formats and rules (verify from official sources, every year)

| ID | Fact to verify | Used by | Where to check | Status |
|---|---|---|---|---|
| VF-01 | Current national university admission test: subject blocks, item counts, timing, scoring weights, penalties, exam window | V-ADM | The official national assessment agency (uzbmb.uz, `[VERIFY]` the domain) | open |
| VF-02 | National subject certificates (Math first): levels, format, validity, conversion to admission points | V-ADM | Same agency | open |
| VF-03 | National Russian-language certificate, if any: level scale and format | V-RU | Same agency | open |
| VF-04 | ТРКИ (TORFL) current levels, sections and pass marks | V-RU | Official TORFL testing centers | open |
| VF-05 | EPS-TOPIK current format, item counts, pass threshold and any skills test | V-KO | Official EPS and HRD Korea sources | open |
| VF-06 | TOPIK I and II current format, scoring, and internet-based TOPIK status | V-KO | Official TOPIK site | open |
| VF-07 | Goethe-Zertifikat A1–B2 modules and scoring | V-LANG | goethe.de | open |
| VF-08 | Teacher language-certificate requirements (level per role, pay effects, accepted certificates) | V-TCH | Ministry and agency regulations | open |
| VF-09 | Presidential and specialized school selection stages and test content | V-SEL | Official school agency announcements | open |

## Legal and compliance

| ID | Question | Why it matters | Status |
|---|---|---|---|
| LG-01 | Does Uzbekistan's personal-data law require citizens' personal data to be stored on servers in the country, and what does it cover? | Hosting for Proctor recordings, ID checks and possibly all learner data | open; needs a lawyer |
| LG-02 | Guardian-consent rules for minors' data | V-ADM, V-SEL, parent reports | open |
| LG-03 | Licence terms for using any official sample questions | All exam verticals | open |
| LG-04 | Advertising rules for exam-result claims | Marketing | open |
| LG-05 | Cross-center anonymized data aggregation: consent wording and limits | V-HW, V-CRS moat | open |
| LG-06 | Schood as payment agent for centers: agency contracts, fiscal receipts per sale, payout splitting (later stage, V-CRS-F13) | V-CRS | open, not needed for launch |
| LG-07 | Instalment-payment providers that integrate with Click, and their terms (later stage, V-CRS-F12) | V-CRS | open, not needed for launch |
| LG-08 | Course IP ownership between centers and star teachers (contract template) | V-CRS | open |

## Market data to collect (validation gate inputs)

| ID | Data | Used by |
|---|---|---|
| MD-01 | What centers pay today for CRM, LMS and testing tools, and what they would pay for Assessment Cloud plus content | 30, all B2B |
| MD-02 | Number of centers reachable through Academy, by subject taught | 01, 30 |
| MD-03 | Search and Telegram demand per vertical, and waitlist conversion at a stated price | 01 |
| MD-04 | Typical tuition per month per subject in centers (to anchor B2C pricing) | 00 pricing frame |
| MD-05 | AI grading quality for Russian and Korean on real learner samples | V-RU, V-KO |

## Owner decisions pending

| ID | Decision | Default until decided |
|---|---|---|
| OD-01 | Confirm the vertical order (01_PORTFOLIO) after validation data | V-RU, then V-ADM |
| OD-02 | Generalize the `learner_language_*` tables vs add `learner_subject_*` (PE-03) | Decide at V-ADM kickoff |
| OD-03 | Price points per vertical and per B2B package | No public prices until validated |
| OD-04 | Whether to hire subject content authors or contract them per item | Contract per item for pilots |
| OD-05 | Proctor go-to-market: institutions now, or inbound only | Inbound only |

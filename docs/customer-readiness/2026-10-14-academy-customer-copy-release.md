# Academy customer wording and phone layout

Frontend-only release from main `0f853d6263f46fba8179859cd4fdc39f6c8e762f`.
No database, Edge Function, payment authority, workflow or infrastructure change
is part of this release.

Imports, student follow-ups and payment messages use plain English, Uzbek and
Russian. Examples: “Check rows,” “Save checked rows,” “Students needing
attention” and “Payment received, access needs review.” Import records display
names/status instead of raw IDs or JSON. Partial saves and records awaiting
review no longer receive a full-success notice.

The follow-up sections use selected/focused 44px buttons, spaced fields and
existing mint/forest/lime tokens. Phone import history displays labeled rows
with actions onscreen. The alert counter is labeled as 30-day alerts, preserving
its meaning when one student has several evaluations. Backend import behavior remains the installed behavior;
the larger scoped/atomic import candidate remains separate in draft PR 248.

Local qualification: Academy build/lint, verify:prod, frontend-only manifest
check, 822 readiness checks and 172 source smoke checks. Seven focused browser
cases pass, including billing at 1440/817/390/320px, follow-up controls and import
actions at 320/768/1024/1440px. Rendered phone output was inspected. Exact-head
CI 38558843952 passed. PR 251 merged to main
`86ccdaf7b048d4e03d2b151b614cca2314441ab2`; tracked Pages deployment
38559622384 passed. Read-only anonymous root/route/asset checks confirm the
published wording and responsive styles. See
`2026-10-14-academy-customer-copy-production.json`.

Rollback uses the prior tracked Academy Pages deployment. No manual backend
activation is required. This release does not declare the full customer
readiness audit or the twelve requested features complete.

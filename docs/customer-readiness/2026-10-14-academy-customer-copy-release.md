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
with actions onscreen. Backend import behavior remains the installed behavior;
the larger scoped/atomic import candidate remains separate in draft PR 248.

Local qualification: Academy build/lint, verify:prod, frontend-only manifest
check, 822 readiness checks and 172 source smoke checks. Seven focused browser
cases pass, including billing at 1440/817/390/320px, follow-up controls and import
actions at 320/768/1024/1440px. Rendered phone output was inspected. Required
exact-head CI and tracked Pages deployment remain the release gate.

Rollback uses the prior tracked Academy Pages deployment. No manual backend
activation is required. This release does not declare the full customer
readiness audit or the twelve requested features complete.

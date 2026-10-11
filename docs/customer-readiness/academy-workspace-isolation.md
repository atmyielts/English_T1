# Academy workspace response isolation

## Problem and behavior

Slow responses could overwrite the workspace selected more recently. A pending startup could also restore the private Academy screen after sign-out in another tab. These are client state ownership defects; this change does not modify server authorization.

Academy selection now updates the URL immediately. The validated URL activates the workspace, clears its records and forms, and remounts workspace components. Data and contact enrichment responses commit only while their academy and request generation remain current. Selection stays usable while the next workspace loads.

Startup and student dashboard requests are invalidated when authentication changes. Private Academy caches are cleared, and authentication refresh runs outside the authentication SDK callback. An obsolete startup cannot restore the signed-in screen.

Teaching dates show only their own lesson data. Older day responses are ignored, and lesson actions and editable fields wait for current data and outstanding writes.

The parent portal selects children by relationship identity instead of list position. Requests, drafts, notification history and preferences belong to the selected child or its academy guardian. Failed message sends preserve the draft. Initial dashboard errors have a retry button.

## Verification and limits

Browser regressions cover overlapping academy requests, overlapping teaching dates, child reorder and cross-academy preferences, sign-out in another tab during startup, and failed message retry. They use controlled API responses and synthetic sessions. They establish client behavior, not production backend authorization or real customer latency.

The prior classroom loading release independently loads classroom operations and Academy reports. This change preserves that scheduling and avoids the duplicate load previously triggered by Academy selection. It does not claim a measured improvement for every Academy route.

Only the Academy frontend changes. No database migration, Edge Function deployment, payment setting, secret or customer-record update is required. Rollback baseline is main commit `28bdd04e479888e71e60c21c40a4ba47afe5a7b9`.

Further qualification remains necessary for real authenticated load timings, manual inbox thread races, classroom chat refresh races, and broader all-service customer journeys.

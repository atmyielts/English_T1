# Academy save isolation

Pending office saves now belong to one authenticated actor, Academy, route, and visit. Leaving that context invalidates completion callbacks, including errors and busy-state cleanup. Returning to the same context creates a new visit; it cannot reactivate an old callback.

The shared task guard covers contact, offer, grant, classroom, roster, announcement, alert, action-item, landing, settlement, checkout and Academy creation operations, inbox sends, workspace refresh, and Telegram assistant links. Form controls freeze submitted values while a request is pending. A failed write retains its draft. An obsolete checkout or assistant response cannot navigate the current workspace.

Academy creation navigates after the guarded create/list response. The destination bootstrap owns its initial reads, avoiding the previous duplicate workspace load before navigation.

This is frontend completion ownership. It does not cancel a submitted server mutation or prove payment provider completion, database authorization, or server idempotency.

## Verification

- Six browser regressions fail against the prior published Academy frontend, with backend traffic mocked or blocked: pending contact fields and failed draft recovery, obsolete contact success and failure during a new Academy save, obsolete checkout navigation, and active/abandoned Academy creation.
- Full Academy browser suite, build, touched-source lint, localization, production readiness scan, and diff checks are required for release.
- Existing inbox, classroom, role, responsive, keyboard, and recovery coverage remains in the full suite.
- The receptionist Telegram fixture uses the same actor in its session and mocked profile, matching the production identity contract.
- After release, repeat the six regressions against the published frontend, check all frontend deployments, and require the credentialed Academy live smoke.

## Separate remaining loading investigation

A real owned account completed browser email/password sign-in and Platform navigation. Chrome then reported `ERR_CONNECTION_RESET` during the Academy document request, before any Academy API request. Independent HTTP retrieval using the same cookies returned 200; eight anonymous Chrome comparisons returned 200. The owned account was closed through the production account endpoint and its personal profile removal/login rejection verified. This does not qualify authenticated Academy performance or establish an application defect. The diagnostic account used a fictional reserved phone value without SMS delivery.

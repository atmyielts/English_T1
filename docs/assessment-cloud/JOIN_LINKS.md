# Self-service onboarding: join links and institution name

Status: implemented and locally evidenced (2026-10-22). It removes the two steps that stopped a new institution from running its first test without help.

- **Before:** staff registered candidates by typing their internal account ID.
- **Before:** candidates needed an institution-specific Exam link.

This change does not close the institution-administration ledger row. Roster import, notifications and department scopes are still open.

## Workflow

1. **Teacher account.** A teacher creates an ordinary Schood account. Every new account owns a personal workspace, so they can sign in to Assessment Cloud and build a test straight away. The Assessment Cloud sign-in page links to schood.online for account creation and password recovery.
2. **Institution name.** In **Staff & permissions → Institution name**, an owner, admin or `team.manage` holder sets the name candidates see.
   - Without it, the personal workspace name (the account email) is shown.
   - The name is Assessment-only (`assessment_institution_profiles`) and does not rename the mother-platform tenant.
   - Changes are revision-fenced and audited.
3. **Join link.** In **Exam sittings**, an `exams.manage` holder creates a join link for an open sitting.
   - It looks like `https://exam.schood.online/#join=<link id>.<code>`. Share it in a class chat, by email or on paper.
   - An optional place limit is folded away.
   - **Replace link** creates a new link and turns the old one off.
   - **Turn off link** stops new joins.
   - Either way, candidates who already joined keep their registration.
4. **Candidate opens the link.** If they are not signed in, Exam asks them to sign in or create a Schood account.
   - Account creation happens on schood.online with `returnTo` set to the same join link.
   - The shared `.schood.online` session brings them back signed in.
   - The code is moved from the address bar into this tab's session storage, so it is not left in the visible URL or in history.
5. **Join.** The candidate sees the institution, test and time window, and joins with one confirmation. This creates an ordinary registration with `created_by` set to the candidate.
   - The candidate does **not** become an institution or Assessment member and gets no staff rights.
   - Opening the link again shows "already joined".
6. **Opening Exam later.** Exam opens without a `tenant_id` link. With one institution it goes straight to that institution's tests; with several it offers a choice.

## Server boundary

Migration `20261022180000_assessment_join_links.sql` (additive) adds the following.

**`assessment_join_links`**
- One active link per sitting (partial unique index).
- Join count with an optional limit.
- Revocation happens only once. Deletion and code edits are refused by a guard trigger.
- Browser roles have no access.

**`assessment_institution_profiles`, plus `assessment_institution_name(tenant)`**
- `assessment_workspaces` now prefers the chosen name. Its result shape is unchanged.

**New `assessment_command` actions** (wrapping `assessment_command_before_join_links`):
- `join_link.create`
- `join_link.revoke`
- `institution.rename`
- They use the usual staff fence, capability check, idempotency receipt and audit.

**Service-only candidate RPCs:**
- `assessment_join_preview` and `assessment_join_accept`.
- Accept locks the link row: concurrent joins by one person converge on one registration, and a limit is never exceeded.
- Audited as `registration.join`.
- `assessment_candidate_institutions` returns the institutions where the person has a registration.

**API (`assessment-cloud`):**
- `POST candidate/join/preview` and `POST candidate/join/accept` take `{link_id, code}` and need no `tenant_id`. Codes that do not match `^[a-f0-9]{64}$` are refused before the database is called.
- `GET candidate/institutions`.
- Staff reads: `join-links` (`exams.manage`) and `institution-profile` (`team.manage`).

**Why the code is stored as is.** The link code is stored readable so staff can copy it again later. It is a low-sensitivity bearer secret: it can only register the signed-in person themself for one open sitting, and staff can replace or turn it off at any time.

**Builds.** Assessment Cloud uses `VITE_ASSESSMENT_EXAM_URL`. Both apps use `VITE_PLATFORM_URL`. `VITE_ALLOWED_RETURN_HOSTS` now includes `assessment.schood.online` and `exam.schood.online`, so schood.online sign-up can return there.

## Evidence

```powershell
node scripts/test-assessment-db.mjs
deno test --no-lock supabase/functions/assessment-cloud/handler.test.ts
node scripts/test-assessment-appeals-browser.mjs --join
npm --workspace apps/assessment-cloud run build
npm --workspace apps/exam run build
```

**SQL integration** (`assessment-join-links.integration.sql`) covers:
- receipt replay
- rights and foreign-institution refusals
- preview states: open, joined, full, revoked, closed
- repeat join without double counting
- the place limit
- replacement: the old link is refused, existing registrations are kept
- closed sittings
- the institution chooser
- the revision-fenced rename and the name shown in workspaces and preview
- immutability, audit, and no client grants

**Four-process races** (`test-assessment-join-race.mjs`):
- One person joining from four tabs gets one registration.
- When four joins compete for the last two places, two are admitted and exactly one person is refused with `join_link_full`.

**Handler test:** no tenant is needed, malformed codes never reach the database, and staff commands forward only canonical fields.

**Connected browser journey** (`--join`): real app → production handler/repository → PostgreSQL.
1. The owner names the institution.
2. The owner creates a link.
3. A brand-new account opens it and is offered account creation that returns to the same link.
4. The account signs in, sees the institution and test, and joins.
5. Exam reopens without an institution link.
6. Reopening the link shows "already joined".
7. The candidate starts the test.
8. The owner sees "Joined: 1" and turns the link off. Another account is then refused.

Canonical proof: one self-created registration, zero memberships, one attempt, one join audit, and the link shows `joined 1, revoked`. Screenshots are taken at five widths with no horizontal overflow, under `output/playwright/join`.

Hosted schood.online sign-up (email confirmation, then return) is a mother-platform flow. It was not exercised by this local journey.

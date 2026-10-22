# Question review: comments, change requests and comparisons

Backlog item `BANK-02`. Question versions stay immutable. A reviewer who wants something changed closes that version, the author answers with a new version, and the reviewer sees exactly what changed before approving.

## Workflow

1. The author saves a draft and submits it for review (`item.submit`), as before.
2. Anyone with question rights (`items.write` or `items.approve`) can comment on a draft, in-review or changes-requested version: `item.comment {id, area, body}`. Approved and retired versions take no comments (`item_review_closed`).
3. An independent reviewer (`items.approve`, not the version's author) can **request changes** on a version in review: `item.request_changes {id, area, body, review_hash}`. Like approval, it names the exact reviewed material through `review_hash`, so a stale screen gets `review_required`. The version moves to `changes_requested`. It can no longer be approved, and nothing can move it back to review.
4. The author creates a new revision from the version they opened. `item.revise` now requires `base_version_id`. If anyone saved a newer version of the question in the meantime, the revision is refused with `item_revision_conflict` instead of silently creating a second branch. A lost reply retried with the same key returns the original result.
5. The reviewer opens the new version. **Changes since version N** lists every changed field, grouped as question text, answer options, scoring key, rubric, media, points and details, with before and after values. Keys are normalized before comparing, so defaults the editor writes out are not reported as changes. The approval hash still covers the exact stored bytes. The review comments for all versions are shown in order, marked *You*, *Question author* or *Reviewer*.

`area` is one of `general`, `prompt`, `options`, `key`, `rubric`, `media`, `scoring`, `metadata`. Comments are 1–5,000 characters.

## Storage and API

Migration `20261022160000_assessment_item_review.sql` is additive:

- `assessment_item_versions.status` also allows `changes_requested`, and the version guard allows `review → changes_requested`.
- `assessment_item_review_comments` is append-only (a trigger refuses update and delete), has row-level security on, and only `service_role` can read it.
- `assessment_command` is wrapped (the previous one is kept as `assessment_command_before_item_review`). The new actions take the staff write fence, the command advisory lock, `assessment_commands` receipts and audit events like every other command.

`GET item-versions/<id>/review` adds:

- `comparison`: `{base_id, base_version, base_status, changes[], areas[], truncated}`, or `null` for a first version. At most 500 changes are listed.
- `comments`: `[{id, item_version_id, version, kind, area, body, created_at, author}]`.

The comparison logic is `packages/assessment-core/src/item-diff.ts`.

## Verification

```powershell
deno test --no-lock packages/assessment-core/src/item-diff.test.ts
deno test --no-lock --allow-env supabase/functions/assessment-cloud/handler.test.ts
node scripts/test-assessment-db.mjs
node scripts/test-assessment-appeals-browser.mjs --item-review
```

- `supabase/tests/assessment-item-review.integration.sql` covers:
  - comment rights, areas, empty comments, receipts and key reuse
  - change requests refused on drafts, by the author, or without a reviewed hash
  - approval and reopening refused after a change request
  - the revision fence, lost-reply replay and foreign base versions
  - comments refused on approved versions
  - append-only history, audit events and that clients have no table access
- The four-process race (`scripts/test-assessment-item-review-race.mjs`) checks that four revisions from one base produce exactly one new version and three `item_revision_conflict` refusals, and that an approval racing three change requests records exactly one decision. Disabling the fence makes the suite fail.
- The `--item-review` browser journey uses the actual Assessment Cloud app:
  - the reviewer requests a wording change on version 1
  - the version is closed to approval
  - the author replies and saves version 2 from version 1, then submits it
  - the author cannot approve their own version
  - the reviewer sees exactly one change (question text, before and after) and both comments, then approves
  - scores are unchanged
- Screenshots are in `output/playwright/item-review` at widths 1440, 1024, 768, 390 and 320.

This is local connected evidence with the local identity and PostgREST stand-ins, not hosted proof.

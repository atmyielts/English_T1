# Parallel CI builds without weakening the merge gate

Recovery UI run 38055124286 completed its tests but was canceled while building Platform at the 20-minute job limit. GitHub's check annotation confirms the timeout. The serial workflow left all builds waiting behind the browser and native database suites.

The same suites now run in a checks job while three build groups compile all 13 deployed frontends in parallel. Previously the CI workflow explicitly built only eight; the Pages deployment built all 13. Academy product smoke still runs after the Academy build. Checks have a 30-minute allowance for the existing native cases; build groups retain a 20-minute allowance.

The existing `validate` job name remains the aggregate merge gate. It always runs after checks and every build group, and fails if any dependency failed, was canceled, timed out or skipped. Contract checks compare the frontend inventory to Pages, preserve the original commands, and execute the actual gate shell against all 36 dependency-result combinations. The CI token has read-only repository permissions. No application, backend or Pages publication command changes.

Source baseline: f8b7c5d1a6f6806b59920b9de00570dbb372ea8e. Publish this infrastructure PR separately from feature changes after its own complete CI succeeds. If needed, revert through a PR. After merge, update the recovery UI candidate to this workflow and qualify that exact head again; do not reuse the timed-out result.

Observed 2026-10-10: GitHub reports this private repository's main branch as unprotected, and its rules API returns HTTP 403 requiring GitHub Pro or a public repository. Local hooks block direct pushes, but there is currently no confirmed hosted branch-protection rule. Keep the repository private and use the checked PR procedure; hosted enforcement requires an account-plan change. This CI change does not claim to install branch protection or block direct pushes on GitHub.

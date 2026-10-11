# Conserving hosted Actions minutes

New commits to the same PR cancel obsolete CI runs. Main validation remains
uncancelled, and every test, build group and required aggregate gate stays intact.

Pages uses one small planning job before starting its 13 build/deploy jobs.
Documentation, brand assets, release records and SQL-only changes skip publication.
All other paths still publish every frontend. In particular shared Supabase Edge
files remain included because the platform imports Guide definitions from them.
Missing history, deleted/moved app files, unknown paths and manual dispatches
conservatively publish all apps. Compare the previous pushed head with the entire
new pushed head, not just the final commit.

The iTEP domain setup now runs only after a successful manual dispatch. Existing
DNS and custom-domain bindings persist across deployments; normal code releases
do not need to rewrite them. Dedicated domain configuration workflows remain
available for provisioning.

These changes do not restore an exhausted allowance or bypass a required check.
They must themselves pass hosted CI before merging. No billing setting or paid
budget is changed. Reverting this PR restores the previous scheduling behavior.

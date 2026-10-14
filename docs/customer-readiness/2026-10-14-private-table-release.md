# Academy private-table access release

The installed contacts SELECT policy admits any active tenant member, including
a student. It can expose other contacts in that Academy outside the scoped
service API. An isolated fixture reproduces that policy from read-only production
metadata with two synthetic peer records; no customer records are inspected.

This release removes browser/public table and column privileges on exactly
contacts, classrooms, classroom memberships, payments, staff, role grants and
staff branch assignments. It preserves service-role access, all stored records,
RLS definitions and schema fields. Shipped clients use the service API for these
records. No frontend or Edge Function source changes are part of this release.

The regression suite exercises the old peer-read exposure, inherited public
column grants, both browser roles and service-role continuity (90 checks). The
native suite runs in its own network-isolated database and removes only its
verified owned container and anonymous volume.

Activation requires protected CI/merge, current installed-history comparison,
one-migration dry run, captured-schema role compatibility and owned hosted
service/raw-table checks. Production activation and cleanup evidence will be
recorded separately. Never apply pending importer or concurrent proctor changes
as part of this release.

This is one corrected exposure. Staff delegation, remaining scoped service
actions and the wider customer-readiness acceptance list remain open. The
unreleased importer stays in draft PR 248.

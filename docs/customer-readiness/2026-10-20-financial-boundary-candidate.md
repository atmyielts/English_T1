# Financial tables and views use the gateway boundary

Hosted acceptance of PR 257 reached all 21 financial actions and verified the
gateway's mixed-grant restrictions. Its direct-table test found an independently
queryable payroll table. Catalogue inspection confirmed that the older finance
and payroll policies take institution IDs, with no branch/resource predicate.
Those policies cannot establish the current independent scope rules. Existing
service-only financial RPC privileges remain intact.

This ACL-only change extends the already deployed private-table boundary to
34 reviewed financial relations, including the five aggregate/definer views,
old collection case/attempt records, compensation and lesson delivery. It revokes
table and column privileges from PUBLIC, anon and authenticated and preserves
service-role access. Current clients read and write these records through the
Academy gateway; the repository contains no frontend direct-table consumer for
these financial records. No data or RLS policy is deleted.

Qualification checks real table/column privileges under captured production
roles, including relations selected by the old finance/payroll predicates, and
re-exercises all 21 operational commands. Activation must use a protected PR,
tracked Pages and exactly this one migration above the installed 225 baseline.
Academy v87 and its 30 installed runtime modules remain untouched. Verify actual
HTTP direct-table refusals and legitimate mixed-branch gateway behavior after
activation before closing hosted acceptance.

The first owned financial QA run also exposed a cleanup naming collision when
two classrooms were archived under one name. The repair used unique owned IDs;
42 checks confirmed both accounts closed and the institution archived. Retained
institutional financial evidence remains. No customer records, external provider
messages or real funds were used. A fresh real-file/UI run follows the ACL repair.

# Parallel release checks

The preceding CI checks job serialized Academy route tests, all 19 root test
aliases, Guide browser coverage, Edge contracts and dependency auditing. A
measured release spent approximately 173 seconds in Academy routes, 465 seconds
in the root test chain and 70 seconds in Guide browser coverage. This creates
avoidable waiting before every production release.

Root test aliases now run in four isolated runner groups: payments, account
security, platform workflows and learning/integrations. The Academy and Guide
browser suites use two separate runners. Each runner installs its dependencies
and required tools. Test groups remain sequential internally, avoiding shared
database fixtures, browser ports or file races within a runner. Matrix failures
do not cancel other groups, so the complete result remains available.

The original checks job retains production/release verification, Academy
readiness/lint, secret scanner contracts, Guide contracts/typecheck, English and
Academy Edge typechecks/contracts, and runtime dependency auditing. The three
frontend build groups and the Pages deployment gates remain intact.

The required `validate` job waits for checks, all contract groups, both browser
groups and all builds. It accepts only success. Contract tests exercise all
1,296 dependency-state combinations and execute the group shell against first,
middle and final suite failures. Another contract compares the matrix to the
actual root `npm test` chain, requiring every alias exactly once and rejecting
an unclassified command when that chain changes.

This change preserves the root `npm test` command for local use. It increases
runner concurrency and does not claim a speed improvement until an exact-head
hosted run has measured it. There are no application, backend, database, secret
or production deployment-policy changes.

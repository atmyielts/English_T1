# Academy public pages and billing refinement

The checkout form stretched its grid tracks to the height of a twelve-row
summary panel. At a desktop viewport this made selects and the submit button
oversized. The reproduced 1440px regression fails before the correction;
content-sized forms and a compact summary keep controls at normal accessible
sizes at 320, 390, 817 and 1440px. Reconciliation counts remain available in an
expandable section. Payment filters and checkout/settlement commands retain
their existing permissions and behavior.

Payment totals now group by currency instead of adding different currencies
and labeling the result UZS. The mixed-currency browser case also verifies that
filtering recomputes those separate totals. A paid record is described as paid;
it no longer claims the learning-access engine has definitely run. Known payment
statuses and reconciliation messages are translated. The localization check
now includes the complete office-heading lookup, preventing untranslated
headings such as Billing & payments from escaping the source catalog.

The public service landing and membership-gated setup, directory, Academy
overview, classroom directory and classroom overview share a restrained
mint/forest/lime presentation, white panels and lighter typography. Common
navigation includes the actual Schood logo, inline language selection and an
accessible phone menu with Escape/focus recovery. The service page has working
section links and a clearly labeled example workspace. Its unsigned marketing
page does not show an account-updates widget. Membership-scoped overview data
is not made public by these style changes.

Authentication remains in the main Schood service. Academy's existing sign-in
links, shared-cookie behavior, return destinations and authorization boundaries
are preserved. No Academy sign-in/password pages are introduced. No additional
home API calls, remote fonts, dependencies, backend changes or customer-record
mutations are part of this release.

Before publishing, require the complete exact-head CI suite, production secret
scan, localization, lint, Academy build and frontend release checks. Inspect
desktop and phone captures, then verify the published billing/public workflows
and the matching authenticated live smoke run. Mocked browser fixtures prove
frontend behavior, not real Click settlement. The previously recorded hosted
connection-reset/initial-style reliability finding remains open. Roll back to
the prior qualified main `4e64929862e3a8d93d6a32908dbbe5771ffb84e0` if needed.

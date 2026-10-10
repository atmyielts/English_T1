# Checkout attempt identity

Internal browser utility shared by Platform and Academy. Import `attempt.ts`
directly; it has no runtime dependencies and is compiled by each app.

Keys describe an explicit purchase intent and the authenticated actor. Keep the
same key after timeouts, lost responses, page refreshes or activation delays.
Clear it only after confirmed fulfillment or a confirmed unpaid terminal state.
Never store tokens, personal contact details or provider secrets here. Prices and
remaining credit do not identify a retry: the server returns the captured order.

Session storage is per browser tab and origin. Restricted storage falls back to
memory for the mounted attempt; it cannot guarantee recovery after a refresh.
The database transaction remains the authority for deduplication and grants.

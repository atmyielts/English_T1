// How many lessons a track must keep. The content test holds each track to this, so a
// track that has grown cannot quietly shrink again. Unlisted tracks need the base eight.
export const TRACK_MINIMUMS: Record<string, number> = {
  general: 16,
  hospitality: 16,
  customer_service: 16,
  sales: 16,
  banking_finance: 16,
  office_admin: 16,
  engineering: 16,
  it_software: 16,
  healthcare: 16,
  logistics: 16,
  management: 16,
};

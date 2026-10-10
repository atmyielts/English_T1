// Both sides of the stored report capability must agree on academy scope.
// A foreign-key contact ID alone is not an academy authorization boundary.
export function parentReportReadStatus(
  academyId: string, contactId: string,
  contact: { id?: unknown; academy_id?: unknown } | null,
  academy: { id?: unknown } | null,
  queryErrors: unknown[],
): 200 | 404 | 503 {
  if (queryErrors.some(Boolean)) return 503;
  if (!contact || contact.id !== contactId || contact.academy_id !== academyId || !academy || academy.id !== academyId) return 404;
  return 200;
}

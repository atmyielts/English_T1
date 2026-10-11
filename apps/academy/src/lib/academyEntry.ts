// The Academy staff directory can report empty access as this specific
// denial. It is not interchangeable with another denial or a failed lookup.
export const isMissingAcademyMembershipError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const match = error.message.match(/^POST \/(?:academy|teacher-studio) failed \(403\): (.+)$/);
  if (!match) return false;
  try {
    const body: unknown = JSON.parse(match[1]);
    return !!body && typeof body === 'object' &&
      'error' in body && body.error === 'No active academy membership';
  } catch {
    return false;
  }
};

const encoder = new TextEncoder();

const digest = async (value: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));

const equalDigest = (left: Uint8Array, right: Uint8Array): boolean => {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left[index] ^ right[index];
  return mismatch === 0;
};

export const bearerToken = (req: Request): string | null => {
  const authorization = req.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() || null : null;
};

/** Edge-to-edge calls use the service role bearer; Workers may use TELEGRAM_INTERNAL_SECRET. */
export const isInternalRequest = async (
  req: Request,
  expectedServiceRole: string,
  expectedWorkerSecret?: string | null,
): Promise<boolean> => {
  const supplied = bearerToken(req) ?? req.headers.get("x-worker-secret")?.trim() ?? "";
  const expected = bearerToken(req) ? expectedServiceRole : String(expectedWorkerSecret ?? "");
  if (!supplied || !expected) return false;
  return equalDigest(await digest(supplied), await digest(expected));
};

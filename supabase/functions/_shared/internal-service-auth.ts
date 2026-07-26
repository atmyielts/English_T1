const encoder = new TextEncoder();

const sha256 = async (value: string): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));

const timingSafeEqual = async (
  left: string,
  right: string,
): Promise<boolean> => {
  const [leftHash, rightHash] = await Promise.all([
    sha256(left),
    sha256(right),
  ]);
  let difference = 0;
  for (let index = 0; index < leftHash.length; index += 1) {
    difference |= leftHash[index] ^ rightHash[index];
  }
  return difference === 0;
};

export const getBearerToken = (req: Request): string | null => {
  const authorization = req.headers.get("Authorization")?.trim() ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  const token = match?.[1]?.trim() ?? "";
  return token || null;
};

export const isServiceRoleRequest = async (
  req: Request,
  serviceRoleKey: string,
): Promise<boolean> => {
  const token = getBearerToken(req);
  if (!token || !serviceRoleKey) return false;
  return timingSafeEqual(token, serviceRoleKey);
};

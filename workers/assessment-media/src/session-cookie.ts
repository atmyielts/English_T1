/** Reads the existing Schood session envelope. This does NOT authenticate a JWT:
 * the canonical Edge Auth authority verifies it on every media read. No URL tokens. */
export function mediaAuthorization(request: Request, now = Date.now()): string {
  // An explicit bad header must never fall back to a different cookie identity.
  if (request.headers.has("authorization"))
    return request.headers.get("authorization") ?? "";
  if (
    request.method !== "GET" ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    return "";
  const raw = request.headers.get("cookie") ?? "";
  if (!raw || raw.length > 40000) return "";
  const cookies = new Map<string, string>();
  for (const field of raw.split(";")) {
    const separator = field.indexOf("=");
    if (separator < 0) continue;
    const name = field.slice(0, separator).trim();
    if (name !== "schood-auth" && !name.startsWith("schood-auth.")) continue;
    if (cookies.has(name)) return "";
    cookies.set(name, field.slice(separator + 1).trim());
  }
  const count = cookies.get("schood-auth.__chunks");
  let encoded = cookies.get("schood-auth") ?? "";
  if (count !== undefined) {
    if (encoded || !/^(?:[1-9]|1[0-6])$/.test(count)) return "";
    encoded = "";
    for (let index = 0; index < Number(count); index++) {
      const part = cookies.get(`schood-auth.${index}`);
      if (!part || part.length > 4000) return "";
      encoded += part;
    }
  }
  if (!encoded || encoded.length > 32000) return "";
  try {
    const session = JSON.parse(decodeURIComponent(encoded));
    if (
      !session ||
      typeof session !== "object" ||
      Array.isArray(session) ||
      typeof session.access_token !== "string" ||
      !/^\S{1,16000}$/.test(session.access_token) ||
      !Number.isSafeInteger(session.expires_at) ||
      session.expires_at <= Math.floor(now / 1000)
    )
      return "";
    return `Bearer ${session.access_token}`;
  } catch {
    return "";
  }
}

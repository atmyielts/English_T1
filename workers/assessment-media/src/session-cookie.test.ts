import { mediaAuthorization } from "./session-cookie.ts";
const now = 2000000000000;
const encoded = encodeURIComponent(
  JSON.stringify({
    access_token: "verified-by-edge",
    expires_at: now / 1000 + 60,
  }),
);
function request(
  cookie: string,
  method = "GET",
  extra: Record<string, string> = {},
) {
  return new Request("https://media.schood.online/v1/artifacts/example", {
    method,
    headers: { cookie, ...extra },
  });
}
function equal(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error(`${actual} !== ${expected}`);
}
Deno.test(
  "native media reads accept whole or reordered chunked session cookies",
  () => {
    equal(
      mediaAuthorization(request(`other=x; schood-auth=${encoded}`), now),
      "Bearer verified-by-edge",
    );
    const half = Math.floor(encoded.length / 2);
    equal(
      mediaAuthorization(
        request(
          `schood-auth.1=${encoded.slice(half)}; schood-auth.__chunks=2; schood-auth.0=${encoded.slice(0, half)}`,
        ),
        now,
      ),
      "Bearer verified-by-edge",
    );
  },
);
Deno.test(
  "cookie credentials cannot upload or replace an explicit authorization header",
  () => {
    for (const method of ["PUT", "POST", "OPTIONS", "DELETE"])
      equal(
        mediaAuthorization(request(`schood-auth=${encoded}`, method), now),
        "",
      );
    equal(
      mediaAuthorization(
        request(`schood-auth=${encoded}`, "GET", { authorization: "bad" }),
        now,
      ),
      "bad",
    );
    equal(
      mediaAuthorization(
        request(`schood-auth=${encoded}`, "GET", {
          "sec-fetch-site": "cross-site",
        }),
        now,
      ),
      "",
    );
  },
);
Deno.test(
  "ambiguous, expired, malformed and excessive cookie envelopes fail closed",
  () => {
    for (const cookie of [
      `schood-auth=${encoded}; schood-auth=${encoded}`,
      `schood-auth=${encoded}; schood-auth.__chunks=1; schood-auth.0=${encoded}`,
      "schood-auth.__chunks=2; schood-auth.0=partial",
      "schood-auth.__chunks=17",
      "schood-auth.__chunks=-1",
      "schood-auth=%ZZ",
      "schood-auth=null",
      `schood-auth=${encodeURIComponent(JSON.stringify({ access_token: "a", expires_at: now / 1000 }))}`,
      `schood-auth=${encodeURIComponent(JSON.stringify({ access_token: "a b", expires_at: now / 1000 + 60 }))}`,
      `schood-auth=${"a".repeat(40001)}`,
    ])
      equal(mediaAuthorization(request(cookie), now), "");
  },
);

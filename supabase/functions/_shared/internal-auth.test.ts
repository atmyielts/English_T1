import { bearerToken, isInternalRequest } from "./internal-auth.ts";

const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};

Deno.test("internal auth accepts only the configured service bearer", async () => {
  const valid = new Request("https://example.test", { headers: { authorization: "Bearer service-secret" } });
  const invalid = new Request("https://example.test", { headers: { authorization: "Bearer public-anon-key" } });
  assert(bearerToken(valid) === "service-secret", "bearer should be parsed");
  assert(await isInternalRequest(valid, "service-secret"), "service bearer should pass");
  assert(!(await isInternalRequest(invalid, "service-secret")), "other bearer should fail");
});

Deno.test("internal auth supports a separately rotated Worker secret", async () => {
  const request = new Request("https://example.test", { headers: { "x-worker-secret": "worker-secret" } });
  assert(await isInternalRequest(request, "service-secret", "worker-secret"), "worker secret should pass");
  assert(!(await isInternalRequest(request, "service-secret", "different")), "wrong worker secret should fail");
});

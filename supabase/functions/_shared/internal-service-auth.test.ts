import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  getBearerToken,
  isServiceRoleRequest,
} from "./internal-service-auth.ts";

const request = (authorization?: string): Request =>
  new Request("https://example.test/functions/v1/send-telegram", {
    method: "POST",
    headers: authorization ? { Authorization: authorization } : undefined,
  });

Deno.test("getBearerToken accepts a case-insensitive Bearer scheme", () => {
  assertEquals(
    getBearerToken(request("bearer service-role-key")),
    "service-role-key",
  );
});

Deno.test("getBearerToken rejects missing and malformed authorization", () => {
  assertEquals(getBearerToken(request()), null);
  assertEquals(getBearerToken(request("Basic credentials")), null);
  assertEquals(getBearerToken(request("Bearer   ")), null);
});

Deno.test("isServiceRoleRequest accepts only the exact service-role key", async () => {
  assertEquals(
    await isServiceRoleRequest(
      request("Bearer service-role-key"),
      "service-role-key",
    ),
    true,
  );
  assertEquals(
    await isServiceRoleRequest(
      request("Bearer user-access-token"),
      "service-role-key",
    ),
    false,
  );
  assertEquals(
    await isServiceRoleRequest(
      request("Bearer service-role-key-extra"),
      "service-role-key",
    ),
    false,
  );
  assertEquals(
    await isServiceRoleRequest(request(), "service-role-key"),
    false,
  );
});

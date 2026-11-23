import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { installFakeDb } from "../_shared/testing/fake-supabase.ts";
import { loadHandler } from "../_shared/testing/serve-capture.ts";

Deno.env.set("SUPABASE_URL", "http://fake.supabase.test");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");
Deno.env.set("SUPABASE_ANON_KEY", "anon-key-test");

const sat = "5cf6e8e2-e6b1-4f8f-9d35-1c932866d6ef";
const handler = await loadHandler(new URL("./index.ts", import.meta.url));

async function begin(
  requested: string,
  requestedSections: string[] = [],
  existingSections: string[] = [],
  productId = sat,
) {
  const db = installFakeDb({
    users: { token: "learner" },
    tables: {
      users: [{ id: "learner", role: "student" }],
      experiences: ["mock-1", "mock-2"].map((id) => ({
        id,
        product_id: productId,
        metadata: {},
      })),
      tenant_memberships: [{
        user_id: "learner",
        tenant_id: "tenant",
        status: "active",
      }],
      entitlements: [{
        tenant_id: "tenant",
        resource_type: "product",
        resource_id: productId,
        is_active: true,
      }],
      sessions: [{
        id: "open-attempt",
        experience_id: "mock-1",
        user_id: "learner",
        status: "active",
        "experiences.product_id": productId,
        metadata: { allowed_section_ids: existingSections },
      }],
    },
  });
  const response = await handler(
    new Request("http://fake.supabase.test/functions/v1/start-session", {
      method: "POST",
      headers: {
        Authorization: "Bearer token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        experience_id: requested,
        tenant_id: "tenant",
        metadata: { allowed_section_ids: requestedSections },
      }),
    }),
  );
  assertEquals(db.writes, []);
  const body = await response.json();
  if (response.status >= 500) throw new Error(JSON.stringify(body));
  return { status: response.status, body };
}

Deno.test("a matching SAT mock and section set can resume", async () => {
  const result = await begin("mock-1", ["math", "reading"], [
    "reading",
    "math",
  ]);
  assertEquals(result.status, 200);
  assertEquals(result.body, { session_id: "open-attempt", reused: true });
});

Deno.test("a different SAT mock never receives the open mock's session", async () => {
  const result = await begin("mock-2");
  assertEquals(result.status, 409);
  assertEquals(result.body.code, "different_active_test");
});

Deno.test("a section-only SAT attempt does not stand in for a full mock", async () => {
  const result = await begin("mock-1", [], ["math"]);
  assertEquals(result.status, 409);
  assertEquals(result.body.code, "different_active_test");
});

Deno.test("other exam products retain their existing same-device reuse", async () => {
  const result = await begin("mock-2", [], [], "other-product");
  assertEquals(result.status, 200);
  assertEquals(result.body, { session_id: "open-attempt", reused: true });
});

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  jwtRole,
  looksLikeUserToken,
  matchPlaybookRoute,
  pageCacheControl,
  pathHasRoute,
  PLAYBOOK_ROUTES,
  PRIVATE_NO_STORE,
  PUBLIC_PAGE_CACHE_CONTROL,
} from "./ielts-playbook-routes.ts";
import { pickMarketGuidance } from "./ielts-playbook.ts";

const samplePath = (path: string): string =>
  path.split("/").map((part) => (part.startsWith(":") ? "sample-value" : part)).join("/");

Deno.test("every route is reachable: its own sample path resolves to itself (no shadowing)", () => {
  for (const route of PLAYBOOK_ROUTES) {
    const path = samplePath(route.path);
    const match = matchPlaybookRoute(route.method, path);
    assert(match, `${route.method} ${path} did not match any route`);
    assertEquals(match.name, route.name, `${route.method} ${path} was captured by ${match.name}`);
  }
});

Deno.test("route names and method+pattern pairs are unique", () => {
  const names = PLAYBOOK_ROUTES.map((route) => route.name);
  assertEquals(new Set(names).size, names.length);
  const keys = PLAYBOOK_ROUTES.map((route) => `${route.method} ${route.pattern.source}`);
  assertEquals(new Set(keys).size, keys.length);
});

Deno.test("section coach thread is not swallowed by the page route", () => {
  const thread = matchPlaybookRoute("GET", "/pages/guide-writing-task-2-premium/sections/3f1c2d/thread");
  assertEquals(thread?.name, "section_thread");
  assertEquals(thread?.params, { slug: "guide-writing-task-2-premium", sectionId: "3f1c2d" });

  const page = matchPlaybookRoute("GET", "/pages/writing-master-guide");
  assertEquals(page?.name, "page_detail");
  assertEquals(page?.params.slug, "writing-master-guide");

  // Something nested under a page that is not a real route must not be served as the page.
  assertEquals(matchPlaybookRoute("GET", "/pages/writing-master-guide/anything"), null);
});

Deno.test("nested POST routes resolve to the most specific handler", () => {
  assertEquals(matchPlaybookRoute("POST", "/pages/a/drills")?.name, "page_drills");
  assertEquals(matchPlaybookRoute("POST", "/pages/a/drills/submit")?.name, "page_drills_submit");
  assertEquals(matchPlaybookRoute("POST", "/pages/a/diagnostic")?.name, "page_diagnostic");
  assertEquals(matchPlaybookRoute("POST", "/pages/a/diagnostic/submit")?.name, "page_diagnostic_submit");
  assertEquals(matchPlaybookRoute("POST", "/diagnostic/probe")?.name, "diagnostic_probe");
  assertEquals(matchPlaybookRoute("POST", "/diagnostic/probe/grade")?.name, "diagnostic_probe_grade");
  assertEquals(matchPlaybookRoute("POST", "/pages/a/sections/b/ask")?.params, { slug: "a", sectionId: "b" });
  assertEquals(matchPlaybookRoute("POST", "/plans/crash-14/generate-ai")?.name, "plan_generate_ai");
  assertEquals(matchPlaybookRoute("GET", "/plans/crash-14")?.name, "plan_detail");
  assertEquals(matchPlaybookRoute("DELETE", "/notes/0a1b")?.params, { id: "0a1b" });
});

Deno.test("methods are part of the match; wrong method is distinguishable from unknown path", () => {
  assertEquals(matchPlaybookRoute("POST", "/catalog"), null);
  assert(pathHasRoute("/catalog"));
  assertEquals(matchPlaybookRoute("GET", "/nope"), null);
  assert(!pathHasRoute("/nope"));
  assertEquals(matchPlaybookRoute("get", "/catalog")?.name, "catalog");
  assertEquals(matchPlaybookRoute("GET", "/catalog/")?.name, "catalog");
});

Deno.test("params are URL-decoded", () => {
  assertEquals(matchPlaybookRoute("GET", "/pages/study%2Dplans")?.params.slug, "study-plans");
});

Deno.test("every route in the table has a handler in index.ts", async () => {
  const source = await Deno.readTextFile(new URL("../ielts-playbook/index.ts", import.meta.url));
  for (const route of PLAYBOOK_ROUTES) {
    assert(source.includes(`matched.name === "${route.name}"`), `No handler for ${route.name}`);
  }
  // The old prefix matching must not come back.
  assert(!/route\.startsWith\(/.test(source), "index.ts must route through matchPlaybookRoute");
});

Deno.test("only anonymous public-page responses are publicly cacheable", () => {
  assertEquals(pageCacheControl({ visibility: "public", authenticated: false }), PUBLIC_PAGE_CACHE_CONTROL);
  assertEquals(PUBLIC_PAGE_CACHE_CONTROL, "public, max-age=300, stale-while-revalidate=86400");
  assertEquals(pageCacheControl({ visibility: "public", authenticated: true }), PRIVATE_NO_STORE);
  assertEquals(pageCacheControl({ visibility: "premium", authenticated: false }), PRIVATE_NO_STORE);
  assertEquals(pageCacheControl({ visibility: "premium", authenticated: true }), PRIVATE_NO_STORE);
  assertEquals(pageCacheControl({ visibility: "authenticated", authenticated: true }), PRIVATE_NO_STORE);
});

const fakeJwt = (payload: Record<string, unknown>) => {
  const enc = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.signature`;
};

Deno.test("anon and service keys are not treated as user sessions", () => {
  assertEquals(jwtRole(fakeJwt({ role: "anon" })), "anon");
  assert(!looksLikeUserToken(fakeJwt({ role: "anon" })));
  assert(!looksLikeUserToken(fakeJwt({ role: "service_role" })));
  assert(looksLikeUserToken(fakeJwt({ role: "authenticated", sub: "u1" })));
  assert(!looksLikeUserToken(null));
  // Opaque tokens still get verified by the auth server.
  assert(looksLikeUserToken("not-a-jwt"));
});

Deno.test("market guidance prefers the local guide over the global one", () => {
  const rows = [
    { id: "g-bc", country_code: "GLOBAL", provider_key: "british-council" },
    { id: "uz-bc", country_code: "UZ", provider_key: "british-council" },
    { id: "uz-idp", country_code: "UZ", provider_key: "idp" },
  ];
  assertEquals(pickMarketGuidance(rows, "UZ", "idp")?.id, "uz-idp");
  assertEquals(pickMarketGuidance(rows, "UZ", "british-council")?.id, "uz-bc");
  assertEquals(pickMarketGuidance(rows.slice(0, 2), "UZ", "idp")?.id, "uz-bc");
  assertEquals(pickMarketGuidance(rows, "KZ", "idp")?.id, "g-bc");
  assertEquals(pickMarketGuidance([], "UZ", "idp"), null);
});

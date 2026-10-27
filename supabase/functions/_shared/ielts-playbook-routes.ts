// Route table for the ielts-playbook edge function.
//
// Every route is an anchored regular expression, so a generic route such as
// `GET /pages/:slug` can never swallow a more specific one such as
// `GET /pages/:slug/sections/:id/thread` (that shadowing bug made the section
// coach thread unreachable). Slugs and ids are single path segments.

export type PlaybookRouteName =
  | "catalog"
  | "updates"
  | "market_guidance"
  | "markets"
  | "page_detail"
  | "page_explain"
  | "page_drills"
  | "page_drills_submit"
  | "page_diagnostic"
  | "page_diagnostic_submit"
  | "section_ask"
  | "section_thread"
  | "page_worked_example"
  | "page_band_render"
  | "plan_detail"
  | "plan_generate_ai"
  | "dashboard"
  | "profile_get"
  | "profile_patch"
  | "recommendation_generate"
  | "events"
  | "notes_list"
  | "notes_create"
  | "notes_delete"
  | "diagnostic_probe"
  | "diagnostic_probe_grade"
  | "diagnostic_synthesize"
  | "module_visit";

export type PlaybookRouteMatch = {
  name: PlaybookRouteName;
  params: Record<string, string>;
};

export type PlaybookRouteDef = {
  name: PlaybookRouteName;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  /** Template such as `/pages/:slug/sections/:sectionId/thread`. */
  path: string;
  pattern: RegExp;
  keys: string[];
};

const SEGMENT = "([^/]+)";
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const def = (
  name: PlaybookRouteName,
  method: PlaybookRouteDef["method"],
  path: string,
): PlaybookRouteDef => {
  const keys: string[] = [];
  const source = path
    .split("/")
    .map((part) => {
      if (part.startsWith(":")) {
        keys.push(part.slice(1));
        return SEGMENT;
      }
      return escapeRegExp(part);
    })
    .join("/");
  return { name, method, path, pattern: new RegExp("^" + source + "/?$"), keys };
};

export const PLAYBOOK_ROUTES: readonly PlaybookRouteDef[] = [
  def("catalog", "GET", "/catalog"),
  def("updates", "GET", "/updates"),
  def("market_guidance", "GET", "/market-guidance"),
  def("markets", "GET", "/markets"),
  def("page_detail", "GET", "/pages/:slug"),
  def("page_explain", "POST", "/pages/:slug/explain"),
  def("page_drills", "POST", "/pages/:slug/drills"),
  def("page_drills_submit", "POST", "/pages/:slug/drills/submit"),
  def("page_diagnostic", "POST", "/pages/:slug/diagnostic"),
  def("page_diagnostic_submit", "POST", "/pages/:slug/diagnostic/submit"),
  def("section_ask", "POST", "/pages/:slug/sections/:sectionId/ask"),
  def("section_thread", "GET", "/pages/:slug/sections/:sectionId/thread"),
  def("page_worked_example", "POST", "/pages/:slug/worked-example"),
  def("page_band_render", "POST", "/pages/:slug/band-render"),
  def("plan_detail", "GET", "/plans/:slug"),
  def("plan_generate_ai", "POST", "/plans/:slug/generate-ai"),
  def("dashboard", "GET", "/dashboard"),
  def("profile_get", "GET", "/profile"),
  def("profile_patch", "PATCH", "/profile"),
  def("recommendation_generate", "POST", "/recommendations/generate"),
  def("events", "POST", "/events"),
  def("notes_list", "GET", "/notes"),
  def("notes_create", "POST", "/notes"),
  def("notes_delete", "DELETE", "/notes/:id"),
  def("diagnostic_probe", "POST", "/diagnostic/probe"),
  def("diagnostic_probe_grade", "POST", "/diagnostic/probe/grade"),
  def("diagnostic_synthesize", "POST", "/diagnostic/synthesize"),
  def("module_visit", "POST", "/modules/:slug/visit"),
];

const decode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const matchPlaybookRoute = (method: string, path: string): PlaybookRouteMatch | null => {
  const upper = method.toUpperCase();
  for (const route of PLAYBOOK_ROUTES) {
    if (route.method !== upper) continue;
    const match = route.pattern.exec(path);
    if (!match) continue;
    const params: Record<string, string> = {};
    route.keys.forEach((key, index) => {
      params[key] = decode(match[index + 1] ?? "").trim();
    });
    return { name: route.name, params };
  }
  return null;
};

/** True when some route exists for the path under another method (405 vs 404). */
export const pathHasRoute = (path: string): boolean =>
  PLAYBOOK_ROUTES.some((route) => route.pattern.test(path));

// ---------------------------------------------------------------------------
// Caching rule for page responses.
//
// Only an anonymous request for a public page may be cached by browsers and
// CDNs. Anything a signed-in or premium user receives stays private, so a
// shared cache can never hand premium content to someone else.
// ---------------------------------------------------------------------------

export const PUBLIC_PAGE_CACHE_CONTROL = "public, max-age=300, stale-while-revalidate=86400";
export const PRIVATE_NO_STORE = "private, no-store";

export const pageCacheControl = (input: { visibility: string; authenticated: boolean }): string =>
  !input.authenticated && input.visibility === "public" ? PUBLIC_PAGE_CACHE_CONTROL : PRIVATE_NO_STORE;

/** Decode a JWT payload without verifying it (only used to skip work for anon keys). */
export const jwtRole = (token: string | null | undefined): string | null => {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1]!.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as Record<string, unknown>;
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
};

/** The anon/service keys are not user sessions; calling auth.getUser on them is a wasted round trip. */
export const looksLikeUserToken = (token: string | null | undefined): boolean => {
  if (!token) return false;
  const role = jwtRole(token);
  if (role === "anon" || role === "service_role") return false;
  return true;
};

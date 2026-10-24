// D4: a learner (18 or older) or their guardian lets a centre's homework
// mistakes feed the learner's own Schood English Today plan and Review.
// Off by default, per centre, revocable at any time. The database commands
// (20261025210000_academy_homework_mistake_feed.sql) check who may decide and
// do the copying; this module only authenticates and shapes the answers.

import { type Db, HttpError, rpc } from "./core.ts";
import { loadCentres } from "./telegram.ts";
import { isUuid, type Row, text } from "./lib.ts";

export const ENGLISH_REVIEW_URL = "https://english.schood.online/review";

export type FeedConsent = {
  academy_id: string;
  center_name: string;
  status: "off" | "granted" | "revoked";
  granted_at: string | null;
  granted_by_role: "learner" | "guardian" | null;
  revoked_at: string | null;
  copied: number;
};

const SOURCES = new Set(["academy_web", "telegram_app", "guardian_portal"]);

export const consentSource = (value: unknown, fallback: string): string => {
  const source = text(value, 40);
  return SOURCES.has(source) ? source : fallback;
};

export const shapeConsent = (state: Row | null, centreName: string): FeedConsent => {
  const status = state?.status === "granted" || state?.status === "revoked" ? state.status : "off";
  const role = state?.granted_by_role === "learner" || state?.granted_by_role === "guardian" ? state.granted_by_role : null;
  return {
    academy_id: String(state?.academy_id ?? ""),
    center_name: centreName,
    status,
    granted_at: status === "granted" && state?.granted_at ? String(state.granted_at) : null,
    granted_by_role: status === "granted" ? role : null,
    revoked_at: status === "revoked" && state?.revoked_at ? String(state.revoked_at) : null,
    copied: Number(state?.copied ?? 0) || 0,
  };
};

/** The learner's consent for each centre they attend (or one centre). */
export const learnerConsents = async (sb: Db, userId: string, academyId: string | null) => {
  const centres = (await loadCentres(sb, userId)).filter((c) => !academyId || c.academy_id === academyId);
  const consents = await Promise.all(centres.map(async (centre) => {
    const state = await rpc<Row>(sb, "academy_homework_feed_state", { p_academy: centre.academy_id, p_contact: centre.contact_ids[0] },
      "Your practice setting could not load. Retry.");
    return shapeConsent(state, centre.name);
  }));
  return { consents, practice_url: ENGLISH_REVIEW_URL };
};

/** Turns the feed on (with the 18+ confirmation) or off for one centre. */
export const setLearnerConsent = async (sb: Db, userId: string, body: Row, fallbackSource: string) => {
  if (!isUuid(body.academy_id)) throw new HttpError(400, "academy_id is required");
  if (typeof body.enabled !== "boolean") throw new HttpError(400, "Choose on or off.");
  const academyId = String(body.academy_id);
  const result = await rpc<Row>(sb, "academy_homework_feed_learner_command", {
    p_actor: userId, p_academy: academyId, p_grant: body.enabled, p_confirmed_adult: body.confirmed_adult === true,
    p_source: consentSource(body.source, fallbackSource),
  }, "Your practice setting was not saved. Retry.");
  const { data: tenant } = await sb.from("tenants").select("name").eq("id", academyId).maybeSingle();
  const first = Array.isArray(result?.consents) ? (result.consents as Row[])[0] ?? null : null;
  return { consent: shapeConsent(first, String(tenant?.name ?? "Academy")), practice_url: ENGLISH_REVIEW_URL };
};

/** A guardian's view of the setting for one child. */
export const guardianConsent = async (sb: Db, userId: string, body: Row) => {
  if (!isUuid(body.relationship_id)) throw new HttpError(400, "relationship_id is required");
  const state = await rpc<Row>(sb, "academy_homework_feed_guardian_state", { p_actor: userId, p_relationship: body.relationship_id },
    "This setting could not load. Retry.");
  return { consent: shapeConsent(state, ""), account_linked: state?.account_linked === true };
};

export const setGuardianConsent = async (sb: Db, userId: string, body: Row) => {
  if (!isUuid(body.relationship_id)) throw new HttpError(400, "relationship_id is required");
  if (typeof body.enabled !== "boolean") throw new HttpError(400, "Choose on or off.");
  const state = await rpc<Row>(sb, "academy_homework_feed_guardian_command", {
    p_actor: userId, p_relationship: body.relationship_id, p_grant: body.enabled, p_source: "guardian_portal",
  }, "This setting was not saved. Retry.");
  return { consent: shapeConsent(state, "") };
};

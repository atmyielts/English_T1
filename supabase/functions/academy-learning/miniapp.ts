// Homework inside the Telegram Mini App (schood.online/telegram): open work
// across centres, file upload for longer work, centre switching and the
// learner's own mistakes. Authenticated by Telegram's signed initData.

import { uploadFileToS3 } from "../_shared/media-storage.ts";
import { validateTelegramInitData } from "../_shared/telegram-init-data.ts";
import { configFlag, type Db, HttpError, requiredEnv } from "./core.ts";
import { isUuid, type Row, text } from "./lib.ts";
import {
  handinCentres, type IncomingFile, linkedUser, type LinkedUser, loadCentres, loadOpenWork, loadPreference, recordHandIn,
  savePreference, storeBytes,
} from "./telegram.ts";

export const MINIAPP_FILE_LIMIT = 20 * 1024 * 1024;
export const MINIAPP_TOTAL_LIMIT = 50 * 1024 * 1024;
export const MINIAPP_MAX_FILES = 6;

export type MiniAppDeps = { sb: Db; botToken?: string; upload?: typeof uploadFileToS3; now?: () => number };

const miniAppUser = async (deps: MiniAppDeps, initData: unknown): Promise<LinkedUser> => {
  let identity;
  try {
    identity = await validateTelegramInitData(String(initData ?? ""), deps.botToken ?? requiredEnv("TELEGRAM_BOT_TOKEN"));
  } catch {
    throw new HttpError(401, "Open this page from the Schood Telegram bot again.");
  }
  const user = await linkedUser(deps.sb, identity.telegram_user_id);
  if (!user) throw new HttpError(403, "Link your Schood account first: Account → Link Telegram.");
  return user;
};

const scope = async (deps: MiniAppDeps, user: LinkedUser) => {
  const all = await handinCentres(deps.sb, await loadCentres(deps.sb, user.id));
  const pref = await loadPreference(deps.sb, user.id);
  const active = all.find((c) => c.academy_id === pref?.active_academy_id) ?? null;
  return { all, active, scoped: active ? [active] : all };
};

export const miniAppHomework = async (deps: MiniAppDeps, body: Row) => {
  if (!(await configFlag(deps.sb, "telegram_handin.enabled"))) return { enabled: false, centres: [], work: [], open_mistakes: 0 };
  const user = await miniAppUser(deps, body.initData ?? body.init_data);
  const { all, active, scoped } = await scope(deps, user);
  const work = await loadOpenWork(deps.sb, scoped, (deps.now ?? Date.now)());
  const contactIds = scoped.flatMap((c) => c.contact_ids);
  const { count } = contactIds.length
    ? await deps.sb.from("academy_homework_mistakes").select("id", { count: "exact", head: true }).in("contact_id", contactIds).eq("status", "open")
    : { count: 0 };
  return {
    enabled: true,
    centres: all.map((c) => ({ academy_id: c.academy_id, name: c.name })),
    active_academy_id: active?.academy_id ?? null,
    work,
    open_mistakes: count ?? 0,
  };
};

export const miniAppSetCentre = async (deps: MiniAppDeps, body: Row) => {
  const user = await miniAppUser(deps, body.initData ?? body.init_data);
  const academyId = isUuid(body.academy_id) ? String(body.academy_id) : null;
  if (academyId) {
    const { all } = await scope(deps, user);
    if (!all.some((c) => c.academy_id === academyId)) throw new HttpError(403, "You are not enrolled in this centre.");
  }
  await savePreference(deps.sb, user.id, { active_academy_id: academyId });
  return { ok: true, active_academy_id: academyId };
};

export const miniAppMistakes = async (deps: MiniAppDeps, body: Row) => {
  const user = await miniAppUser(deps, body.initData ?? body.init_data);
  const centres = await loadCentres(deps.sb, user.id);
  const contactIds = centres.flatMap((c) => c.contact_ids);
  if (!contactIds.length) return { mistakes: [] };
  const { data } = await deps.sb.from("academy_homework_mistakes")
    .select("id, academy_id, assignment_id, tag, excerpt, correction, explanation, status, created_at")
    .in("contact_id", contactIds).neq("status", "dismissed").order("created_at", { ascending: false }).limit(200);
  const names = new Map(centres.map((c) => [c.academy_id, c.name]));
  return { mistakes: ((data ?? []) as Row[]).map((m) => ({ ...m, center_name: names.get(String(m.academy_id)) ?? "" })) };
};

const fileKind = (mime: string): string =>
  mime.startsWith("image/") ? "photo" : mime.startsWith("audio/") ? "audio" : mime.startsWith("video/") ? "video" : "document";

/** Multipart: init_data, assignment_id or submission_id (correction), text, files[]. */
export const miniAppSubmit = async (deps: MiniAppDeps, form: FormData) => {
  if (!(await configFlag(deps.sb, "telegram_handin.enabled"))) throw new HttpError(409, "Homework hand-in is not switched on yet.");
  const user = await miniAppUser(deps, form.get("init_data") ?? form.get("initData"));
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const body = text(form.get("text"), 10000) || null;
  if (!files.length && !body) throw new HttpError(400, "Add a file or write your answer.");
  if (files.length > MINIAPP_MAX_FILES) throw new HttpError(400, `Send at most ${MINIAPP_MAX_FILES} files at once.`);
  let total = 0;
  for (const file of files) {
    total += file.size;
    if (file.size > MINIAPP_FILE_LIMIT) throw new HttpError(413, "Each file must be under 20 MB.");
  }
  if (total > MINIAPP_TOTAL_LIMIT) throw new HttpError(413, "All files together must be under 50 MB.");

  const { scoped } = await scope(deps, user);
  const work = await loadOpenWork(deps.sb, scoped, (deps.now ?? Date.now)());
  const assignmentId = String(form.get("assignment_id") ?? ""), submissionId = String(form.get("submission_id") ?? "");
  const target = work.find((w) => isUuid(submissionId) ? w.type === "correction" && w.submission_id === submissionId : w.type === "assignment" && w.assignment_id === assignmentId);
  if (!target) throw new HttpError(409, "This homework is no longer open. Refresh the list.");

  const incoming: IncomingFile[] = [];
  for (const file of files) {
    const mime = (file.type || "application/octet-stream").toLowerCase();
    incoming.push({ bytes: new Uint8Array(await file.arrayBuffer()), name: file.name || null, mime, kind: fileKind(mime), uniqueId: null });
  }
  const stored = await storeBytes(deps.upload ?? uploadFileToS3, target, incoming, "academy-learning.miniapp.upload");
  const result = await recordHandIn(deps.sb, user.id, target, stored, body, "telegram_app");
  return result.kind === "correction"
    ? { ok: true, kind: "correction", title: target.title }
    : { ok: true, kind: "submission", title: target.title, attempt_number: result.submission.attempt_number, status: result.submission.status };
};

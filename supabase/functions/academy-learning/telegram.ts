// Telegram homework hand-in (V-HW-F2) and centre switching (D3).
//
// The student bot Worker forwards media messages, plain text, /homework,
// /center and hw:/ctr: callbacks here. Submissions are written only through
// academy_assignment_written_command, the same RPC the Academy web hand-in
// uses, so enrollment, wallet, release, due-date and attempt rules stay in one
// place.

import { uploadFileToS3 } from "../_shared/media-storage.ts";
import { configFlag, type Db, HttpError, rpc, type Telegram } from "./core.ts";
import {
  allowedMime, type AssignmentRow, botCommand, escapeHtml, fileExtension, formatDue, isUuid, openAssignments,
  type OpenWork, parseCallback, type Row, sortOpenWork, type SubmissionRow, TELEGRAM_DOWNLOAD_LIMIT, telegramItem,
  type TelegramItem, text,
} from "./lib.ts";

export type LinkedUser = { id: string; name: string };
export type Centre = { academy_id: string; name: string; contact_ids: string[] };

export type TelegramDeps = {
  sb: Db;
  tg: Telegram;
  siteUrl: string;
  now?: () => number;
  upload?: typeof uploadFileToS3;
};

const FOCUS_MINUTES = 120;

const webAppButton = (siteUrl: string, label: string, route = "view=academy&section=assignments") => {
  const url = new URL(`${siteUrl.replace(/\/$/, "")}/telegram`);
  new URLSearchParams(route).forEach((v, k) => url.searchParams.set(k, v));
  url.searchParams.set("source", "telegram_bot");
  return { text: label, web_app: { url: url.toString() } };
};

const send = (deps: TelegramDeps, chatId: string, body: string, markup?: Row) =>
  deps.tg.call("sendMessage", {
    chat_id: chatId, text: body, parse_mode: "HTML", disable_web_page_preview: true,
    ...(markup ? { reply_markup: markup } : {}),
  });

export const linkedUser = async (sb: Db, telegramUserId: string): Promise<LinkedUser | null> => {
  const { data } = await sb.from("users").select("id, full_name, email").eq("telegram_chat_id", telegramUserId).maybeSingle();
  if (!data?.id) return null;
  return { id: String(data.id), name: String(data.full_name || String(data.email ?? "").split("@")[0] || "Student") };
};

/** Centres the learner belongs to, from the confirmed-contact RPC. */
export const loadCentres = async (sb: Db, userId: string): Promise<Centre[]> => {
  const result = await rpc<Row>(sb, "academy_student_contacts_command", { p_actor_id: userId }, "Your student links could not be confirmed.");
  const contacts = Array.isArray(result?.contacts) ? result.contacts as Row[] : [];
  const byAcademy = new Map<string, string[]>();
  for (const c of contacts) {
    const academy = String(c.academy_id ?? "");
    if (!isUuid(academy) || !isUuid(c.id)) continue;
    byAcademy.set(academy, [...(byAcademy.get(academy) ?? []), String(c.id)]);
  }
  if (!byAcademy.size) return [];
  const { data: tenants } = await sb.from("tenants").select("id, name").in("id", [...byAcademy.keys()]);
  const names = new Map(((tenants ?? []) as Row[]).map((t) => [String(t.id), String(t.name ?? "Academy")]));
  return [...byAcademy.entries()]
    .map(([academy_id, contact_ids]) => ({ academy_id, contact_ids, name: names.get(academy_id) ?? "Academy" }))
    .sort((a, b) => a.name.localeCompare(b.name));
};

export const loadPreference = async (sb: Db, userId: string): Promise<Row | null> => {
  const { data } = await sb.from("telegram_student_preferences")
    .select("active_academy_id, focus_assignment_id, focus_set_at").eq("user_id", userId).maybeSingle();
  return data ?? null;
};

export const savePreference = (sb: Db, userId: string, patch: Row) =>
  sb.from("telegram_student_preferences").upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });

/** Centres whose plan and settings currently allow Telegram hand-in. */
export const handinCentres = async (sb: Db, centres: Centre[]): Promise<Centre[]> => {
  if (!centres.length) return [];
  const { data: settings } = await sb.from("academy_homework_settings")
    .select("academy_id, telegram_handin_enabled").in("academy_id", centres.map((c) => c.academy_id));
  const off = new Set(((settings ?? []) as Row[]).filter((s) => s.telegram_handin_enabled === false).map((s) => String(s.academy_id)));
  const allowed: Centre[] = [];
  for (const centre of centres) {
    if (off.has(centre.academy_id)) continue;
    const { data } = await sb.rpc("academy_learning_allows", { p_academy: centre.academy_id, p_capability: "homework" });
    if (data === true) allowed.push(centre);
  }
  return allowed;
};

/** Everything the learner can hand in right now in the chosen centres. */
export const loadOpenWork = async (sb: Db, centres: Centre[], now: number): Promise<OpenWork[]> => {
  const contactIds = centres.flatMap((c) => c.contact_ids);
  if (!contactIds.length) return [];
  const { data: memberships } = await sb.from("academy_classroom_memberships")
    .select("academy_id, classroom_id, contact_id").in("contact_id", contactIds).eq("role", "student").eq("status", "active");
  const contactByClassroom = new Map<string, string>();
  for (const m of (memberships ?? []) as Row[]) contactByClassroom.set(String(m.classroom_id), String(m.contact_id));
  const classroomIds = [...contactByClassroom.keys()];
  if (!classroomIds.length) return [];

  const { data: assignmentRows } = await sb.from("academy_assignments")
    .select("id, academy_id, classroom_id, title, due_at, released_at, status, attempts_allowed, allow_late_submission")
    .in("classroom_id", classroomIds).eq("status", "active").order("due_at", { ascending: true, nullsFirst: false }).limit(200);
  const assignments = (assignmentRows ?? []) as AssignmentRow[];
  const { data: submissionRows } = assignments.length
    ? await sb.from("academy_submissions").select("id, assignment_id, contact_id, attempt_number, status")
      .in("assignment_id", assignments.map((a) => a.id)).in("contact_id", contactIds)
    : { data: [] };
  const submissions = (submissionRows ?? []) as SubmissionRow[];
  const centreName = new Map(centres.map((c) => [c.academy_id, c.name]));

  const work: OpenWork[] = openAssignments(assignments, submissions, contactByClassroom, now).map((a) => ({
    type: "assignment", assignment_id: a.id, submission_id: null, academy_id: a.academy_id, classroom_id: a.classroom_id,
    contact_id: contactByClassroom.get(a.classroom_id)!, title: a.title, center_name: centreName.get(a.academy_id) ?? "Academy", due_at: a.due_at,
  }));

  // Returned work awaiting a correction from this learner.
  const { data: returned } = await sb.from("academy_homework_events")
    .select("assignment_id, contact_id, classroom_id, academy_id").in("contact_id", contactIds).eq("event", "returned").limit(50);
  for (const r of (returned ?? []) as Row[]) {
    const sub = submissions.find((s) => s.assignment_id === r.assignment_id && s.contact_id === r.contact_id)
      ?? (await sb.from("academy_submissions").select("id, assignment_id, contact_id, attempt_number, status")
        .eq("assignment_id", r.assignment_id).eq("contact_id", r.contact_id).maybeSingle()).data as SubmissionRow | null;
    if (!sub) continue;
    const { count: corrected } = await sb.from("academy_homework_events").select("id", { count: "exact", head: true })
      .eq("assignment_id", r.assignment_id).eq("contact_id", r.contact_id).eq("event", "corrected");
    const { count: pending } = await sb.from("academy_homework_corrections").select("id", { count: "exact", head: true })
      .eq("submission_id", sub.id).eq("status", "submitted");
    if ((corrected ?? 0) > 0 || (pending ?? 0) > 0) continue;
    const { data: assignment } = await sb.from("academy_assignments").select("title, due_at").eq("id", r.assignment_id).maybeSingle();
    work.push({
      type: "correction", assignment_id: String(r.assignment_id), submission_id: sub.id, academy_id: String(r.academy_id),
      classroom_id: String(r.classroom_id), contact_id: String(r.contact_id), title: String(assignment?.title ?? "Homework"),
      center_name: centreName.get(String(r.academy_id)) ?? "Academy", due_at: null,
    });
  }
  return sortOpenWork(work);
};

const recordOpened = async (sb: Db, items: OpenWork[]) => {
  const rows = items.filter((w) => w.type === "assignment").map((w) => ({
    academy_id: w.academy_id, assignment_id: w.assignment_id, classroom_id: w.classroom_id, contact_id: w.contact_id,
    event: "opened", source: "telegram_bot",
  }));
  if (rows.length) await sb.from("academy_homework_events").upsert(rows, { onConflict: "assignment_id,contact_id,event", ignoreDuplicates: true });
};

const workLabel = (w: OpenWork, showCentre: boolean): string => {
  const prefix = w.type === "correction" ? "✏️ Fix: " : "📄 ";
  const due = w.due_at ? ` · ${formatDue(w.due_at)}` : "";
  return `${prefix}${w.title}${showCentre ? ` (${w.center_name})` : ""}${due}`.slice(0, 64);
};

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

const scopedCentres = async (deps: TelegramDeps, user: LinkedUser) => {
  const all = await handinCentres(deps.sb, await loadCentres(deps.sb, user.id));
  const pref = await loadPreference(deps.sb, user.id);
  const active = all.find((c) => c.academy_id === pref?.active_academy_id) ?? null;
  return { all, active, scoped: active ? [active] : all, pref };
};

export const sendCentres = async (deps: TelegramDeps, chatId: string, user: LinkedUser) => {
  const { all, active } = await scopedCentres(deps, user);
  if (!all.length) {
    await send(deps, chatId, "You are not enrolled in a centre that uses Telegram homework yet.");
    return;
  }
  const rows = all.map((c) => [{ text: `${c.academy_id === active?.academy_id ? "✅ " : ""}${c.name}`.slice(0, 64), callback_data: `ctr:${c.academy_id}` }]);
  if (all.length > 1) rows.push([{ text: `${active ? "" : "✅ "}All centres`, callback_data: "ctr:all" }]);
  await send(deps, chatId,
    `<b>Your centres</b>\n\nChoose where your homework goes. ${active ? `Now: <b>${escapeHtml(active.name)}</b>.` : "Now: all centres."}`,
    { inline_keyboard: rows });
};

export const sendHomeworkList = async (deps: TelegramDeps, chatId: string, user: LinkedUser) => {
  const { all, active, scoped } = await scopedCentres(deps, user);
  const now = (deps.now ?? Date.now)();
  const work = await loadOpenWork(deps.sb, scoped, now);
  if (!work.length) {
    const hint = all.length > 1 ? `\n\nShowing ${active ? escapeHtml(active.name) : "all centres"}. Switch with /center.` : "";
    await send(deps, chatId, `No open homework right now.${hint}`, { inline_keyboard: [[webAppButton(deps.siteUrl, "Open assignments")]] });
    return;
  }
  await recordOpened(deps.sb, work);
  const showCentre = scoped.length > 1;
  const lines = [`<b>Open homework${active ? ` · ${escapeHtml(active.name)}` : ""}</b>`, ""];
  for (const w of work.slice(0, 10)) {
    lines.push(`${w.type === "correction" ? "✏️" : "📄"} <b>${escapeHtml(w.title)}</b>${showCentre ? ` · ${escapeHtml(w.center_name)}` : ""}${w.due_at ? `\n    Due ${escapeHtml(formatDue(w.due_at))}` : ""}`);
  }
  lines.push("", "Tap a task to see it, then send your answer here: text, photos, a voice note or a file.");
  const buttons = work.slice(0, 8).filter((w) => w.type === "assignment")
    .map((w) => [{ text: workLabel(w, showCentre), callback_data: `hw:v:${w.assignment_id}` }]);
  if (all.length > 1) buttons.push([{ text: "Switch centre", callback_data: "ctr:all" }]);
  await send(deps, chatId, lines.join("\n"), { inline_keyboard: buttons });
};

const viewAssignment = async (deps: TelegramDeps, chatId: string, user: LinkedUser, assignmentId: string) => {
  const { scoped } = await scopedCentres(deps, user);
  const work = await loadOpenWork(deps.sb, scoped, (deps.now ?? Date.now)());
  const item = work.find((w) => w.type === "assignment" && w.assignment_id === assignmentId);
  if (!item) {
    await send(deps, chatId, "This homework is no longer open. Send /homework to see what is.");
    return;
  }
  const { data: assignment } = await deps.sb.from("academy_assignments").select("title, description, due_at, max_score").eq("id", assignmentId).maybeSingle();
  await savePreference(deps.sb, user.id, { focus_assignment_id: assignmentId, focus_set_at: new Date().toISOString() });
  await recordOpened(deps.sb, [item]);
  const body = [
    `<b>${escapeHtml(assignment?.title ?? item.title)}</b> · ${escapeHtml(item.center_name)}`,
    assignment?.due_at ? `Due ${escapeHtml(formatDue(String(assignment.due_at)))}` : "",
    "",
    escapeHtml(text(assignment?.description, 3000) || "No instructions were added."),
    "",
    "Send your answer in this chat now. It will go to this task.",
  ].filter((line, i) => line !== "" || i > 0).join("\n");
  await send(deps, chatId, body);
};

// ---------------------------------------------------------------------------
// Hand-in
// ---------------------------------------------------------------------------

export type StoredFile = Row & { sha256: string; telegram_file_unique_id: string | null; kind: string };
export type IncomingFile = { bytes: Uint8Array<ArrayBuffer>; name: string | null; mime: string; kind: string; uniqueId: string | null };

const sha256Hex = async (bytes: Uint8Array<ArrayBuffer>) =>
  Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");

/** Uploads hand-in files under the classroom's submission prefix, as the Academy web upload does. */
export const storeBytes = async (upload: typeof uploadFileToS3, target: OpenWork, files: IncomingFile[], route: string): Promise<StoredFile[]> => {
  const stored: StoredFile[] = [];
  for (const file of files) {
    if (!allowedMime(file.mime)) throw new HttpError(415, "This file type cannot be handed in.", "file_type_not_allowed");
    const ext = fileExtension({ mime_type: file.mime, file_name: file.name, kind: file.kind as TelegramItem["kind"] });
    const path = `academy/${target.academy_id}/classrooms/${target.classroom_id}/submission/${crypto.randomUUID()}.${ext}`;
    const filename = (file.name || `${file.kind}.${ext}`).replace(/[^\w.\- ]+/g, "_").slice(0, 120);
    const result = await upload(path, new File([file.bytes], filename, { type: file.mime }), file.mime, { route });
    stored.push({
      provider: "s3", bucket: result.bucket, path: result.path, filename, mime_type: file.mime, size_bytes: file.bytes.byteLength,
      uploaded_at: new Date().toISOString(), sha256: await sha256Hex(file.bytes), telegram_file_unique_id: file.uniqueId, kind: file.kind,
    });
  }
  return stored;
};

const storeItems = async (deps: TelegramDeps, target: OpenWork, items: TelegramItem[]): Promise<StoredFile[]> => {
  const incoming: IncomingFile[] = [];
  for (const item of items) {
    if (!allowedMime(item.mime_type)) throw new HttpError(415, "This file type cannot be handed in.", "file_type_not_allowed");
    if ((item.file_size ?? 0) > TELEGRAM_DOWNLOAD_LIMIT) throw new HttpError(413, "This file is too large for Telegram hand-in.", "telegram_file_too_large");
    const { bytes } = await deps.tg.download(item.file_id, TELEGRAM_DOWNLOAD_LIMIT);
    incoming.push({ bytes, name: item.file_name, mime: item.mime_type, kind: item.kind, uniqueId: item.file_unique_id });
  }
  return storeBytes(deps.upload ?? uploadFileToS3, target, incoming, "academy-learning.telegram.upload");
};

const flagIntegrity = async (sb: Db, submission: Row, files: StoredFile[], typedSource: string | null) => {
  const attempt = Math.max(1, Number(submission.attempt_number ?? 1));
  const signals: Row[] = [];
  if (typedSource && !files.length) {
    signals.push({ signal: "untimed_source", severity: "info", detail: { source: typedSource } });
  }
  const uniques = files.map((f) => f.telegram_file_unique_id).filter(Boolean) as string[];
  const hashes = files.map((f) => f.sha256);
  if (files.length) {
    const { data: others } = await sb.from("academy_submissions").select("id, contact_id, metadata")
      .eq("assignment_id", submission.assignment_id).neq("contact_id", submission.contact_id).limit(500);
    const matches = ((others ?? []) as Row[]).filter((o) => {
      const meta = (o.metadata ?? {}) as Row;
      const theirs = [meta.storage, ...(Array.isArray(meta.pages) ? meta.pages : [])].filter(Boolean) as Row[];
      return theirs.some((f) => hashes.includes(String(f.sha256 ?? "")) || (f.telegram_file_unique_id && uniques.includes(String(f.telegram_file_unique_id))));
    });
    if (matches.length) {
      signals.push({ signal: "duplicate_media", severity: "review", detail: { matching_submission_ids: matches.slice(0, 5).map((m) => m.id) } });
    }
  }
  if (!signals.length) return;
  await sb.from("academy_homework_integrity_signals").upsert(signals.map((s) => ({
    academy_id: submission.academy_id, submission_id: submission.id, attempt_number: attempt, ...s,
  })), { onConflict: "submission_id,attempt_number,signal", ignoreDuplicates: true });
};

export type HandInResult = { kind: "submission"; submission: Row } | { kind: "correction" };

/**
 * Saves a hand-in for the learner: a correction row, or a submission through
 * academy_assignment_written_command (the RPC keeps enrollment, wallet and attempt rules).
 */
export const recordHandIn = async (
  sb: Db, userId: string, target: OpenWork, files: StoredFile[], body: string | null, source: "telegram_bot" | "telegram_app",
): Promise<HandInResult> => {
  if (target.type === "correction" && target.submission_id) {
    const { error } = await sb.from("academy_homework_corrections").insert({
      academy_id: target.academy_id, submission_id: target.submission_id, assignment_id: target.assignment_id,
      classroom_id: target.classroom_id, contact_id: target.contact_id, content: body, media: files, source,
    });
    if (error) throw new HttpError(503, "Your correction was not saved. Send it again.");
    return { kind: "correction" };
  }
  const payload = {
    submission_content: body ?? "",
    submission_url: "",
    notes: "",
    metadata: {
      response_kind: files.length ? "file" : "text",
      ...(files[0] ? { storage: files[0] } : {}),
      ...(files.length > 1 ? { pages: files.slice(1) } : {}),
      storage_kind: files.length ? "student_submission" : undefined,
      source,
      media_kinds: [...new Set(files.map((f) => f.kind))],
    },
  };
  const submission = await rpc<Row>(sb, "academy_assignment_written_command",
    { p_academy: target.academy_id, p_actor: userId, p_assignment: target.assignment_id, p_payload: payload },
    "Your homework was not saved. Send it again.");
  await flagIntegrity(sb, submission, files, body && !files.length && source === "telegram_bot" ? "telegram_text" : null);
  return { kind: "submission", submission };
};

const fileWork = async (deps: TelegramDeps, chatId: string, user: LinkedUser, target: OpenWork, items: TelegramItem[], body: string | null) => {
  const files = await storeItems(deps, target, items);
  const result = await recordHandIn(deps.sb, user.id, target, files, body, "telegram_bot");
  if (result.kind === "correction") {
    await send(deps, chatId, `✅ Correction received for <b>${escapeHtml(target.title)}</b> · ${escapeHtml(target.center_name)}.\nYour teacher will check it.`);
    return;
  }
  const { submission } = result;
  await savePreference(deps.sb, user.id, { focus_assignment_id: null, focus_set_at: null });
  const parts = files.length ? `${files.length} file${files.length > 1 ? "s" : ""}` : "your text answer";
  const late = submission.status === "late" ? "\n⚠️ Marked late." : "";
  await send(deps, chatId,
    `✅ Received ${parts} for <b>${escapeHtml(target.title)}</b> · ${escapeHtml(target.center_name)}\nAttempt ${escapeHtml(submission.attempt_number ?? 1)}${target.due_at ? ` · due ${escapeHtml(formatDue(target.due_at))}` : ""}${late}`);
};

const draftItems = (draft: Row): TelegramItem[] => (Array.isArray(draft.items) ? draft.items : []) as TelegramItem[];

const promptForTarget = async (deps: TelegramDeps, chatId: string, draft: Row, work: OpenWork[], showCentre: boolean) => {
  const options = work.slice(0, 6);
  await deps.sb.from("academy_telegram_handin_drafts").update({ options, prompt_sent: true }).eq("id", draft.id);
  const count = draftItems(draft).length;
  const what = count ? "these files" : "this answer";
  await send(deps, chatId, `Which homework is ${what} for?`, {
    inline_keyboard: [
      ...options.map((w, i) => [{ text: workLabel(w, showCentre), callback_data: `hw:p:${draft.id}:${i}` }]),
      [{ text: "Cancel", callback_data: `hw:x:${draft.id}` }],
    ],
  });
};

/** Returns false for plain text from learners with no Homework OS centre, so the bot's old reply stays. */
const handleHandIn = async (deps: TelegramDeps, chatId: string, user: LinkedUser, message: Row): Promise<boolean> => {
  const item = telegramItem(message);
  const body = text(message.caption ?? message.text, 10000) || null;
  if (!item && !body) return false;
  const { all, active, scoped, pref } = await scopedCentres(deps, user);
  if (!all.length) {
    if (!item) return false;
    await send(deps, chatId, "You are not enrolled in a centre that uses Telegram homework yet.");
    return true;
  }
  if (item && (item.file_size ?? 0) > TELEGRAM_DOWNLOAD_LIMIT) {
    await send(deps, chatId, "This file is over 20 MB. Open the app to upload it.", { inline_keyboard: [[webAppButton(deps.siteUrl, "Open assignments")]] });
    return true;
  }
  const mediaGroup = typeof message.media_group_id === "string" ? message.media_group_id : null;
  const appended = await rpc<Row>(deps.sb, "academy_telegram_draft_append",
    { p_user: user.id, p_chat: chatId, p_media_group: mediaGroup, p_item: item, p_text: body },
    "We could not hold your homework. Send it again.");
  const draft = appended.draft as Row;
  // Later photos of an album only join the draft; the first one asks the question.
  if (mediaGroup && appended.created !== true) return true;

  const now = (deps.now ?? Date.now)();
  const work = await loadOpenWork(deps.sb, scoped, now);
  if (!work.length) {
    await deps.sb.from("academy_telegram_handin_drafts").update({ status: "cancelled", consumed_at: new Date().toISOString() }).eq("id", draft.id);
    const hint = all.length > 1 ? `\n\nShowing ${active ? escapeHtml(active.name) : "all centres"}. Switch with /center.` : "";
    await send(deps, chatId, `There is no open homework to hand this in to.${hint}`);
    return true;
  }
  const focusFresh = pref?.focus_assignment_id && pref.focus_set_at && now - Date.parse(String(pref.focus_set_at)) < FOCUS_MINUTES * 60_000;
  const focused = focusFresh ? work.find((w) => w.type === "assignment" && w.assignment_id === pref!.focus_assignment_id) : undefined;
  const single = !mediaGroup && (focused || (work.length === 1 ? work[0] : undefined));
  if (single) {
    const claimed = await deps.sb.from("academy_telegram_handin_drafts").update({ status: "filed", consumed_at: new Date().toISOString() })
      .eq("id", draft.id).eq("status", "open").select("id").maybeSingle();
    if (!claimed.data) return true;
    await fileWork(deps, chatId, user, single, draftItems(draft), (draft.text_content as string | null) ?? body);
    return true;
  }
  await promptForTarget(deps, chatId, draft, focused ? [focused, ...work.filter((w) => w !== focused)] : work, scoped.length > 1);
  return true;
};

const handlePick = async (deps: TelegramDeps, chatId: string, user: LinkedUser, draftId: string, index: number) => {
  const { data: draft } = await deps.sb.from("academy_telegram_handin_drafts").update({ status: "filed", consumed_at: new Date().toISOString() })
    .eq("id", draftId).eq("user_id", user.id).eq("status", "open").gt("expires_at", new Date().toISOString())
    .select("*").maybeSingle();
  if (!draft) {
    await send(deps, chatId, "This hand-in was already sent or has expired. Send your answer again.");
    return;
  }
  const option = (Array.isArray(draft.options) ? draft.options : [])[index] as OpenWork | undefined;
  if (!option) {
    await send(deps, chatId, "That choice is no longer available. Send your answer again.");
    return;
  }
  await fileWork(deps, chatId, user, option, draftItems(draft), (draft.text_content as string | null) ?? null);
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

const failureText = (error: unknown): string => {
  if (error instanceof HttpError) {
    if (error.status === 409) return `⚠️ ${escapeHtml(error.message)}`;
    if (error.status === 403) return "⚠️ This homework is not open for you. Send /homework to see what is.";
    if (error.status === 413 || error.status === 415 || error.status === 422) return `⚠️ ${escapeHtml(error.message)}`;
  }
  return "⚠️ Your homework was not saved. Please send it again in a minute.";
};

/**
 * Returns false when this update is not Homework OS business, so the Worker
 * keeps its previous behaviour (for example while hand-in is switched off).
 */
export const handleTelegramUpdate = async (deps: TelegramDeps, update: Row): Promise<{ handled: boolean }> => {
  if (!(await configFlag(deps.sb, "telegram_handin.enabled"))) return { handled: false };
  const callback = update.callback_query as Row | undefined;
  const message = update.message as Row | undefined;
  const from = (callback?.from ?? message?.from ?? {}) as Row;
  const chat = ((callback?.message as Row | undefined)?.chat ?? message?.chat ?? {}) as Row;
  const telegramUserId = String(from.id ?? "");
  const chatId = String(chat.id ?? telegramUserId);
  if (!/^[0-9]{1,20}$/.test(telegramUserId) || String(chat.type ?? "private") !== "private") return { handled: false };

  if (callback) {
    const action = parseCallback(callback.data);
    if (!action) return { handled: false };
    await deps.tg.call("answerCallbackQuery", { callback_query_id: callback.id }).catch(() => null);
    const user = await linkedUser(deps.sb, telegramUserId);
    if (!user) {
      await send(deps, chatId, "Link your Schood account first: Account → Link Telegram.");
      return { handled: true };
    }
    try {
      if (action.kind === "center") {
        await savePreference(deps.sb, user.id, { active_academy_id: action.academyId });
        await sendHomeworkList(deps, chatId, user);
      } else if (action.kind === "view") {
        await viewAssignment(deps, chatId, user, action.assignmentId);
      } else if (action.kind === "pick") {
        await handlePick(deps, chatId, user, action.draftId, action.index);
      } else {
        await deps.sb.from("academy_telegram_handin_drafts").update({ status: "cancelled", consumed_at: new Date().toISOString() })
          .eq("id", action.draftId).eq("user_id", user.id).eq("status", "open");
        await send(deps, chatId, "Cancelled. Nothing was handed in.");
      }
    } catch (error) {
      console.warn(JSON.stringify({ event: "academy_learning_telegram_callback_failed", kind: action.kind, message: error instanceof Error ? error.message : "unknown" }));
      await send(deps, chatId, failureText(error));
    }
    return { handled: true };
  }

  if (!message) return { handled: false };
  const command = botCommand(message.text);
  const homeworkCommand = command && ["/homework", "/hw", "/center", "/centre"].includes(command.command);
  if (command && !homeworkCommand) return { handled: false };
  const user = await linkedUser(deps.sb, telegramUserId);
  if (!user) return { handled: false };
  try {
    if (command?.command === "/center" || command?.command === "/centre") await sendCentres(deps, chatId, user);
    else if (homeworkCommand) await sendHomeworkList(deps, chatId, user);
    else return { handled: await handleHandIn(deps, chatId, user, message) };
  } catch (error) {
    console.warn(JSON.stringify({ event: "academy_learning_telegram_failed", message: error instanceof Error ? error.message : "unknown" }));
    await send(deps, chatId, failureText(error));
  }
  return { handled: true };
};

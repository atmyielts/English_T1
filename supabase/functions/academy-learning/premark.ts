// AI pre-mark sweep (V-HW-F4), run by pg_cron through invoke_academy_learning.
// Each queued draft is claimed, marked by a free model, and stored for the
// teacher's review queue. Voice notes and documents are left for the teacher:
// there is no free speech-to-text path (decision D5: cheapest first).

import {
  callPremarkModel, PREMARK_PROMPT_VERSION, PremarkError, type PremarkInput, resolvePremarkModel,
} from "../_shared/homework-ai.ts";
import { configFlag, type Db, env, signSubmissionFile, submissionFiles } from "./core.ts";
import { rubricCriteria, type Row, SIMILAR_TEXT_THRESHOLD, text, textSimilarity } from "./lib.ts";

const BATCH = 6;
const MAX_TRIES = 3;
const STALE_RUNNING_MINUTES = 10;

export type PremarkDeps = { sb: Db; fetcher?: typeof fetch };

const finish = (sb: Db, id: string, patch: Row) =>
  sb.from("academy_homework_ai_marks").update({ ...patch, locked_at: null, updated_at: new Date().toISOString() }).eq("id", id);

const claimBatch = async (sb: Db): Promise<Row[]> => {
  const staleBefore = new Date(Date.now() - STALE_RUNNING_MINUTES * 60_000).toISOString();
  await sb.from("academy_homework_ai_marks").update({ status: "queued", locked_at: null })
    .eq("status", "running").lt("locked_at", staleBefore);
  const { data: candidates } = await sb.from("academy_homework_ai_marks").select("id")
    .eq("status", "queued").order("created_at", { ascending: true }).limit(BATCH);
  const claimed: Row[] = [];
  for (const candidate of (candidates ?? []) as Row[]) {
    const { data } = await sb.from("academy_homework_ai_marks")
      .update({ status: "running", locked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", candidate.id).eq("status", "queued").select("*").maybeSingle();
    if (data) claimed.push(data as Row);
  }
  return claimed;
};

/** Similar written answers from other learners on the same assignment. */
const similarTextSignal = async (sb: Db, mark: Row, submission: Row) => {
  const mine = String(submission.submission_content ?? "");
  if (mine.length < 120) return;
  const { data: others } = await sb.from("academy_submissions").select("id, submission_content")
    .eq("assignment_id", mark.assignment_id).neq("contact_id", mark.contact_id).not("submission_content", "is", null).limit(300);
  let best = 0, match: string | null = null;
  for (const other of (others ?? []) as Row[]) {
    const score = textSimilarity(mine, String(other.submission_content ?? ""));
    if (score > best) { best = score; match = String(other.id); }
  }
  if (best < SIMILAR_TEXT_THRESHOLD || !match) return;
  await sb.from("academy_homework_integrity_signals").upsert({
    academy_id: mark.academy_id, submission_id: mark.submission_id, attempt_number: mark.attempt_number,
    signal: "similar_text", severity: "review", detail: { similarity: Math.round(best * 100) / 100, matching_submission_id: match },
  }, { onConflict: "submission_id,attempt_number,signal", ignoreDuplicates: true });
};

const premarkOne = async (deps: PremarkDeps, mark: Row, model: string): Promise<void> => {
  const { sb } = deps;
  const { data: submission } = await sb.from("academy_submissions")
    .select("id, academy_id, classroom_id, assignment_id, contact_id, attempt_number, submission_content, metadata, max_score, graded_at")
    .eq("id", mark.submission_id).maybeSingle();
  if (!submission || Number(submission.attempt_number ?? 1) !== Number(mark.attempt_number)) {
    await finish(sb, String(mark.id), { status: "superseded" });
    return;
  }
  if (submission.graded_at) {
    await finish(sb, String(mark.id), { status: "skipped", skip_reason: "already_graded" });
    return;
  }
  await similarTextSignal(sb, mark, submission).catch(() => undefined);

  const { data: assignment } = await sb.from("academy_assignments")
    .select("title, description, assignment_type, max_score, rubric_id").eq("id", mark.assignment_id).maybeSingle();
  let rubric = null;
  if (assignment?.rubric_id) {
    const { data: rubricRow } = await sb.from("academy_rubrics").select("criteria, status").eq("id", assignment.rubric_id).maybeSingle();
    if (rubricRow && rubricRow.status !== "archived") rubric = rubricCriteria(rubricRow.criteria);
  }
  const files = submissionFiles(submission.metadata);
  const images = files.filter((f) => String(f.mime_type ?? "").startsWith("image/"));
  const others = files.filter((f) => !String(f.mime_type ?? "").startsWith("image/"));
  const written = text(submission.submission_content, 12000);
  const responseKind = images.length && written ? "mixed" : images.length ? "image" : others.length && !written
    ? (others.some((f) => String(f.mime_type ?? "").startsWith("audio/")) ? "audio" : "file") : "text";
  if (!written && !images.length) {
    await finish(sb, String(mark.id), { status: "skipped", response_kind: responseKind, skip_reason: responseKind === "audio" ? "audio_needs_teacher" : "file_needs_teacher" });
    return;
  }
  const imageUrls = (await Promise.all(images.slice(0, 6).map((f) => signSubmissionFile(sb, f, submission)))).filter(Boolean) as string[];
  const maxScore = Number(submission.max_score ?? assignment?.max_score ?? 100) > 0 ? Number(submission.max_score ?? assignment?.max_score ?? 100) : 100;
  const input: PremarkInput = {
    assignmentTitle: String(assignment?.title ?? "Homework"),
    assignmentType: String(assignment?.assignment_type ?? "task"),
    instructions: String(assignment?.description ?? ""),
    maxScore: rubric ? rubric.reduce((sum, c) => sum + c.max, 0) : maxScore,
    rubric,
    text: written || null,
    imageUrls,
  };
  try {
    const { result, model: usedModel } = await callPremarkModel(input, {
      apiKey: env("OPENROUTER_API_KEY") ?? "",
      model,
      baseUrl: env("OPENROUTER_BASE_URL"),
      referer: env("OPENROUTER_REFERER"),
      fetcher: deps.fetcher,
    });
    await finish(sb, String(mark.id), {
      status: "ready", response_kind: responseKind, suggested_score: result.suggested_score, max_score: input.maxScore,
      rubric_scores: result.rubric_scores, summary: result.summary, strengths: result.strengths, improvements: result.improvements,
      mistakes: result.mistakes, confidence: result.confidence, model: usedModel, prompt_version: PREMARK_PROMPT_VERSION,
      tries: Number(mark.tries ?? 0) + 1, error: null, completed_at: new Date().toISOString(),
    });
    await sb.from("academy_homework_events").upsert({
      academy_id: mark.academy_id, assignment_id: mark.assignment_id, classroom_id: mark.classroom_id, contact_id: mark.contact_id,
      event: "premarked", source: "ai", metadata: { mark_id: mark.id, confidence: result.confidence },
    }, { onConflict: "assignment_id,contact_id,event", ignoreDuplicates: true });
  } catch (error) {
    const code = error instanceof PremarkError ? error.code : "unexpected";
    const tries = Number(mark.tries ?? 0) + 1;
    const terminal = ["vision_unavailable", "paid_model_not_allowed", "ai_unconfigured"].includes(code);
    if (terminal) {
      await finish(sb, String(mark.id), { status: "skipped", response_kind: responseKind, skip_reason: code, tries });
    } else {
      await finish(sb, String(mark.id), { status: tries >= MAX_TRIES ? "failed" : "queued", error: code, tries, response_kind: responseKind });
    }
  }
};

export const runPremarkSweep = async (deps: PremarkDeps): Promise<Row> => {
  if (!(await configFlag(deps.sb, "premark.enabled"))) return { processed: 0, skipped: "premark_disabled" };
  let model: string;
  try {
    model = resolvePremarkModel(env);
  } catch (error) {
    return { processed: 0, skipped: error instanceof PremarkError ? error.code : "model_unavailable" };
  }
  const batch = await claimBatch(deps.sb);
  for (const mark of batch) {
    try {
      await premarkOne(deps, mark, model);
    } catch (error) {
      console.warn(JSON.stringify({ event: "academy_learning_premark_failed", mark_id: mark.id, message: error instanceof Error ? error.message : "unknown" }));
      const tries = Number(mark.tries ?? 0) + 1;
      await finish(deps.sb, String(mark.id), { status: tries >= MAX_TRIES ? "failed" : "queued", error: "unexpected", tries });
    }
  }
  return { processed: batch.length, model };
};

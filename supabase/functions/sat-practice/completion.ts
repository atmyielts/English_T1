import { isCorrectAnswer, isObject } from "../_shared/sat-practice-core.ts";

export class AttemptError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function ownedAttempt(sb: any, userId: string, attemptId: string) {
  if (!uuid.test(attemptId)) throw new AttemptError(400, "Invalid drill ID.");
  const { data, error } = await sb.from("sat_practice_lab_attempts").select("*")
    .eq("id", attemptId).eq("user_id", userId).maybeSingle();
  if (error) {
    throw new AttemptError(
      503,
      "The drill is temporarily unavailable. Please retry.",
    );
  }
  if (!data) throw new AttemptError(404, "Drill not found.");
  return data;
}

export async function savedAttemptResult(
  sb: any,
  userId: string,
  attempt: any,
) {
  if (attempt.status !== "scored") return null;
  const { data, error } = await sb.from("sat_practice_attempt_results").select(
    "result",
  ).eq("attempt_id", attempt.id).eq("user_id", userId).maybeSingle();
  if (error) {
    throw new AttemptError(
      503,
      "Results are temporarily unavailable. Please retry.",
    );
  }
  return data?.result ?? null;
}

export async function submitAttempt(
  sb: any,
  userId: string,
  body: Record<string, unknown>,
  loadQuestions: (ids: string[]) => Promise<any[]>,
) {
  const attemptId = typeof body.attempt_id === "string" ? body.attempt_id : "";
  if (!isObject(body.answers) || JSON.stringify(body.answers).length > 65536) {
    throw new AttemptError(400, "Invalid drill answers.");
  }
  const answers = body.answers;
  const attempt = await ownedAttempt(sb, userId, attemptId);
  const ids: string[] = attempt.question_ids ?? [];
  if (Object.keys(answers).some((id) => !ids.includes(id))) {
    throw new AttemptError(400, "An answer does not belong to this drill.");
  }
  // Replays do not depend on a still-published bank, nor on its current answer keys.
  let questions: any[] = [];
  let scored: any[] = [];
  if (attempt.status !== "scored") {
    if (!["in_progress", "submitted"].includes(attempt.status)) {
      throw new AttemptError(409, "This drill cannot be submitted.");
    }
    if (
      ids.length === 0 || ids.length > 100 || new Set(ids).size !== ids.length
    ) {
      throw new AttemptError(
        409,
        "This drill has no valid question set. Please start a new drill.",
      );
    }
    const bank = await loadQuestions(ids);
    const byId = new Map(bank.map((q) => [q.id, q]));
    questions = ids.map((id) => byId.get(id));
    if (questions.some((q) => !q || q.correct == null)) {
      throw new AttemptError(
        409,
        "Some questions are unavailable for scoring. Your answers have been kept.",
      );
    }
    scored = questions.map((q) => ({
      question_id: q.id,
      correct: isCorrectAnswer(answers[q.id], q.correct),
      expected: q.correct,
      answer: answers[q.id] ?? null,
    }));
  }
  const { data, error } = await sb.rpc("complete_sat_practice_attempt", {
    p_user_id: userId,
    p_attempt_id: attemptId,
    p_answers: answers,
    p_questions: questions,
    p_scored_items: scored,
  });
  if (error) {
    if (error.code === "23505") {
      throw new AttemptError(
        409,
        "This drill was already submitted. Open its saved results.",
      );
    }
    if (error.code === "P0002") throw new AttemptError(404, "Drill not found.");
    if (error.code === "22023") {
      throw new AttemptError(
        400,
        "The drill could not be scored. Your answers have been kept.",
      );
    }
    throw new AttemptError(
      503,
      "Submission could not be confirmed. Retry with the same answers or open results to check.",
    );
  }
  if (!data || !data.attempt) {
    throw new AttemptError(
      503,
      "Submission could not be confirmed. Please retry.",
    );
  }
  // Older scored attempts have no immutable question snapshot. Keep their original
  // scores and clearly identify them; never recompute their progress.
  if (data.legacy_result) {
    data.questions = await loadQuestions(ids);
    return data;
  }
  return data;
}

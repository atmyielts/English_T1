export type AcademyQuizQuestionType =
  | "single_choice"
  | "multiple_choice"
  | "true_false"
  | "short_text"
  | "essay";

export type AcademyQuizQuestionForGrading = {
  id: string;
  question_type: AcademyQuizQuestionType;
  correct_answer: unknown;
  points: number;
  explanation?: string | null;
};

export type AcademyQuizQuestionResult = {
  question_id: string;
  status: "correct" | "incorrect" | "pending_manual_grade";
  score: number | null;
  max_score: number;
  explanation: string | null;
};

export type AcademyQuizGrade = {
  score: number;
  max_score: number;
  percentage: number;
  pending_manual_grade: boolean;
  results: AcademyQuizQuestionResult[];
};

export type AcademyRubricGrade =
  | {
    ok: true;
    score: number;
    max_score: number;
    scores: Record<string, number>;
  }
  | { ok: false; error: string };

const normalizedText = (value: unknown): string =>
  String(value ?? "").trim().toLocaleLowerCase();

const normalizedList = (value: unknown): string[] => {
  const items = Array.isArray(value) ? value : [value];
  return Array.from(new Set(items.map(normalizedText).filter(Boolean))).sort();
};

const equalLists = (left: string[], right: string[]): boolean =>
  left.length === right.length &&
  left.every((value, index) => value === right[index]);

const correctShortTextAnswers = (value: unknown): string[] => {
  if (Array.isArray(value)) return normalizedList(value);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return normalizedList(
      record.accepted ?? record.answers ?? record.value ?? [],
    );
  }
  return normalizedList(value);
};

export const validateAcademyQuizQuestion = (question: {
  question_type: string;
  prompt: string;
  options?: unknown;
  correct_answer?: unknown;
  points?: number;
}): string | null => {
  const supported: AcademyQuizQuestionType[] = [
    "single_choice",
    "multiple_choice",
    "true_false",
    "short_text",
    "essay",
  ];
  if (!supported.includes(question.question_type as AcademyQuizQuestionType)) {
    return "Unsupported question type";
  }
  if (!question.prompt.trim()) return "Question prompt is required";
  if (
    !Number.isFinite(question.points ?? 1) || Number(question.points ?? 1) <= 0
  ) return "Question points must be greater than zero";

  if (["single_choice", "multiple_choice"].includes(question.question_type)) {
    const options = normalizedList(question.options ?? []);
    if (options.length < 2) {
      return "Choice questions require at least two options";
    }
    const correct = normalizedList(question.correct_answer);
    if (correct.length === 0) {
      return "Choice questions require a correct answer";
    }
    if (correct.some((answer) => !options.includes(answer))) {
      return "Correct answers must match a configured option";
    }
    if (question.question_type === "single_choice" && correct.length !== 1) {
      return "Single-choice questions require exactly one correct answer";
    }
  }

  if (question.question_type === "true_false") {
    const correct = normalizedText(question.correct_answer);
    if (!["true", "false"].includes(correct)) {
      return "True/false questions require a boolean correct answer";
    }
  }

  if (
    question.question_type === "short_text" &&
    correctShortTextAnswers(question.correct_answer).length === 0
  ) {
    return "Short-text questions require at least one accepted answer";
  }

  return null;
};

export const gradeAcademyQuiz = (
  questions: AcademyQuizQuestionForGrading[],
  answers: Record<string, unknown>,
): AcademyQuizGrade => {
  let score = 0;
  let maxScore = 0;
  let pendingManualGrade = false;
  const results: AcademyQuizQuestionResult[] = [];

  for (const question of questions) {
    const points = Number.isFinite(question.points) && question.points > 0
      ? question.points
      : 1;
    maxScore += points;
    const answer = answers[question.id];

    if (question.question_type === "essay") {
      pendingManualGrade = true;
      results.push({
        question_id: question.id,
        status: "pending_manual_grade",
        score: null,
        max_score: points,
        explanation: null,
      });
      continue;
    }

    let correct = false;
    if (question.question_type === "multiple_choice") {
      correct = equalLists(
        normalizedList(answer),
        normalizedList(question.correct_answer),
      );
    } else if (question.question_type === "short_text") {
      const accepted = correctShortTextAnswers(question.correct_answer);
      correct = accepted.includes(normalizedText(answer));
    } else {
      correct =
        normalizedText(answer) === normalizedText(question.correct_answer);
    }

    const earned = correct ? points : 0;
    score += earned;
    results.push({
      question_id: question.id,
      status: correct ? "correct" : "incorrect",
      score: earned,
      max_score: points,
      explanation: question.explanation?.trim() || null,
    });
  }

  const percentage = maxScore > 0
    ? Math.round((score / maxScore) * 1000) / 10
    : 0;
  return {
    score: Math.round(score * 100) / 100,
    max_score: Math.round(maxScore * 100) / 100,
    percentage,
    pending_manual_grade: pendingManualGrade,
    results,
  };
};

export const gradeAcademyRubric = (
  criteria: unknown[],
  rawScores: unknown,
): AcademyRubricGrade => {
  if (!rawScores || typeof rawScores !== "object" || Array.isArray(rawScores)) {
    return { ok: false, error: "Rubric scores are required" };
  }
  if (criteria.length === 0) {
    return { ok: false, error: "Rubric has no criteria" };
  }
  const input = rawScores as Record<string, unknown>;
  const scores: Record<string, number> = {};
  let score = 0;
  let maxScore = 0;
  for (const [index, criterion] of criteria.entries()) {
    if (
      !criterion || typeof criterion !== "object" || Array.isArray(criterion)
    ) {
      return { ok: false, error: "Rubric criterion is invalid" };
    }
    const row = criterion as Record<string, unknown>;
    const criterionId = String(row.id ?? `criterion-${index + 1}`);
    const criterionMax = Number(row.max_points ?? row.max_score ?? 0);
    const criterionScore = Number(input[criterionId]);
    if (!Number.isFinite(criterionMax) || criterionMax <= 0) {
      return { ok: false, error: `Invalid maximum score for ${criterionId}` };
    }
    if (
      !Number.isFinite(criterionScore) || criterionScore < 0 ||
      criterionScore > criterionMax
    ) {
      return { ok: false, error: `Invalid rubric score for ${criterionId}` };
    }
    scores[criterionId] = criterionScore;
    score += criterionScore;
    maxScore += criterionMax;
  }
  return {
    ok: true,
    score: Math.round(score * 100) / 100,
    max_score: Math.round(maxScore * 100) / 100,
    scores,
  };
};

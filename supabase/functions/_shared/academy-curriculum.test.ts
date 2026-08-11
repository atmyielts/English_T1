import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  gradeAcademyQuiz,
  gradeAcademyRubric,
  validateAcademyQuizQuestion,
} from "./academy-curriculum.ts";

Deno.test("Academy quiz validation rejects unusable choice questions", () => {
  assertEquals(
    validateAcademyQuizQuestion({
      question_type: "single_choice",
      prompt: "Pick one",
      options: ["A"],
      correct_answer: "A",
      points: 1,
    }),
    "Choice questions require at least two options",
  );
});

Deno.test("Academy quiz grading handles auto-graded and essay questions without leaking answers", () => {
  const result = gradeAcademyQuiz(
    [
      {
        id: "q1",
        question_type: "single_choice",
        correct_answer: "B",
        points: 2,
        explanation: "B is supported by the passage.",
      },
      {
        id: "q2",
        question_type: "multiple_choice",
        correct_answer: ["A", "C"],
        points: 3,
      },
      {
        id: "q3",
        question_type: "short_text",
        correct_answer: { accepted: ["Tashkent", "Toshkent"] },
        points: 2,
      },
      { id: "q4", question_type: "essay", correct_answer: null, points: 5 },
    ],
    { q1: "b", q2: ["C", "A"], q3: " toshkent ", q4: "My response" },
  );

  assertEquals(result.score, 7);
  assertEquals(result.max_score, 12);
  assertEquals(result.percentage, 58.3);
  assertEquals(result.pending_manual_grade, true);
  assertEquals(result.results[3].status, "pending_manual_grade");
  assertEquals("correct_answer" in result.results[0], false);
});

Deno.test("Academy quiz grading marks incomplete multiple-choice answers incorrect", () => {
  const result = gradeAcademyQuiz(
    [{
      id: "q1",
      question_type: "multiple_choice",
      correct_answer: ["A", "C"],
      points: 4,
    }],
    { q1: ["A"] },
  );
  assertEquals(result.score, 0);
  assertEquals(result.percentage, 0);
  assertEquals(result.results[0].status, "incorrect");
});

Deno.test("Academy rubric grading validates and totals every criterion", () => {
  const result = gradeAcademyRubric(
    [
      { id: "evidence", name: "Evidence", max_points: 6 },
      { id: "language", name: "Language", max_points: 4 },
    ],
    { evidence: 5.5, language: 3 },
  );

  assertEquals(result, {
    ok: true,
    score: 8.5,
    max_score: 10,
    scores: { evidence: 5.5, language: 3 },
  });
});

Deno.test("Academy rubric grading rejects missing and out-of-range scores", () => {
  const criteria = [{ id: "evidence", name: "Evidence", max_points: 5 }];
  assertEquals(gradeAcademyRubric(criteria, {}), {
    ok: false,
    error: "Invalid rubric score for evidence",
  });
  assertEquals(gradeAcademyRubric(criteria, { evidence: 6 }), {
    ok: false,
    error: "Invalid rubric score for evidence",
  });
});

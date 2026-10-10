import {
  type CoachingAllowance,
  type CoachingDependencies,
  createCoachingHandler,
} from "../_shared/coaching-handler.ts";
import {
  type WritingFeedback,
  type WritingInput,
  writingInput,
} from "./grading.ts";
export type WritingAllowance = CoachingAllowance;
export const createWritingTutorHandler = (
  deps: CoachingDependencies<WritingInput, WritingFeedback>,
) =>
  createCoachingHandler(deps, {
    service: "writing-tutor",
    title: "Writing Tutor",
    action: "grade",
    versionHeader: "X-Writing-Tutor-Version",
    historyTable: "writing_tutor_sessions",
    historySelect:
      "id,exam_type,task_type,word_count,overall_band,criteria,created_at",
    history: (rows) => rows,
    parseInput: writingInput,
    completion: (_input, feedback) => ({
      name: "complete_writing_tutor_request",
      args: { p_feedback: feedback },
    }),
  });

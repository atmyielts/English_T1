import {
  type CoachingDependencies,
  createCoachingHandler,
} from "../_shared/coaching-handler.ts";
import {
  type SpeakingFeedback,
  type SpeakingInput,
  speakingInput,
} from "./grading.ts";
export const createSpeakingCoachHandler = (
  deps: CoachingDependencies<SpeakingInput, SpeakingFeedback>,
) =>
  createCoachingHandler(deps, {
    service: "speaking-coach",
    title: "Speaking Coach",
    action: "score",
    versionHeader: "X-Speaking-Coach-Version",
    historyTable: "speaking_coach_sessions",
    historySelect:
      "id,topic,task_type,word_count,duration_secs,created_at,assessment_scope",
    history: (rows) =>
      rows.map((row) => ({ ...row, overall_band: null, criteria: null })),
    parseInput: speakingInput,
    completion: (input, feedback) => ({
      name: "complete_speaking_coach_request",
      args: { p_feedback: feedback, p_transcript: input.transcript },
    }),
  });

import {
  buildFeedbackPayload,
  buildHubPlanFromRecommendations,
  calculateAttemptScore,
  DEFAULT_ENGLISH_RULE_CONFIGS,
  deriveMasteryReopenUpdate,
  evaluateRecommendationTriggers,
  type RecommendationRow,
} from "./english-learning.ts";

const fail = (message: string): never => {
  throw new Error(message);
};

const assert = (condition: unknown, message: string): void => {
  if (!condition) fail(message);
};

const assertEquals = (actual: unknown, expected: unknown, message: string): void => {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    fail(`${message}\nExpected: ${expectedJson}\nReceived: ${actualJson}`);
  }
};

const cloneRules = () =>
  Object.fromEntries(
    Object.entries(DEFAULT_ENGLISH_RULE_CONFIGS).map(([key, value]) => [
      key,
      {
        ...value,
        thresholds: { ...value.thresholds },
        metadata: value.metadata ? { ...value.metadata } : null,
      },
    ]),
  );

const recommendationRow = (input: Partial<RecommendationRow> & Pick<RecommendationRow, "id" | "recommended_service_key" | "recommendation_type" | "title" | "reason">): RecommendationRow => ({
  recommended_product_id: null,
  recommended_content_item_id: null,
  intent: null,
  skill_key: null,
  priority: 80,
  estimated_minutes: 10,
  payload: null,
  status: "active",
  expires_at: null,
  ...input,
});

Deno.test("evaluateRecommendationTriggers activates the expected roadmap rules", () => {
  const triggers = evaluateRecommendationTriggers({
    rules: cloneRules(),
    notebookStats: {
      dueCount: 3,
      totalCount: 18,
      activationCandidateCount: 4,
    },
    grammarErrors: [
      {
        id: "grammar-error-1",
        service_key: "writing",
        error_frequency: 3,
      },
    ],
    listeningPatternCounts: {
      "clip-a": 2,
    },
    writingRecoveryCount: 3,
    speakingGrammarIssuesCount: 2,
    stableGrammarUnitsCount: 1,
    stableTransferUnitsCount: 2,
  });

  assertEquals(triggers.repeatedGrammarError, true, "Grammar remediation should trigger once the threshold is crossed.");
  assertEquals(triggers.vocabularyActivationNeeded, true, "Vocabulary activation should trigger for idle notebook items.");
  assertEquals(triggers.hasListeningRecovery, true, "Listening recovery should stay inside listening when the same weak pattern repeats.");
  assertEquals(triggers.listeningRecoveryEntry, ["clip-a", 2], "Listening recovery should keep the repeated listening pattern key.");
  assertEquals(triggers.writingNeedsRecovery, true, "Writing recovery should trigger after repeated low-quality revisions.");
  assertEquals(triggers.speakingTransferNeeded, true, "Speaking transfer should trigger when grammar is stable but speech still shows issues.");
  assertEquals(triggers.immersionApplicationNeeded, true, "Immersion application should trigger when stable units exist.");
});

Deno.test("evaluateRecommendationTriggers blocks speaking transfer until grammar is stable when required", () => {
  const triggers = evaluateRecommendationTriggers({
    rules: cloneRules(),
    notebookStats: {
      dueCount: 0,
      totalCount: 0,
      activationCandidateCount: 0,
    },
    grammarErrors: [],
    listeningPatternCounts: {},
    writingRecoveryCount: 0,
    speakingGrammarIssuesCount: 2,
    stableGrammarUnitsCount: 0,
    stableTransferUnitsCount: 0,
  });

  assertEquals(triggers.speakingTransferNeeded, false, "Speaking transfer should stay off until stable grammar exists.");
  assertEquals(triggers.immersionApplicationNeeded, false, "Immersion application should stay off without stable transferable units.");
});

Deno.test("buildHubPlanFromRecommendations preserves review, weakness, and transfer coverage within budget", () => {
  const planned = buildHubPlanFromRecommendations([
    recommendationRow({
      id: "rec-review",
      recommended_service_key: "vocabulary",
      recommendation_type: "review",
      title: "Review due vocabulary cards",
      reason: "3 cards are due.",
      estimated_minutes: 8,
    }),
    recommendationRow({
      id: "rec-grammar",
      recommended_service_key: "grammar",
      recommendation_type: "remediation",
      title: "Repair repeated grammar errors",
      reason: "Articles have repeated 3 times.",
      estimated_minutes: 12,
    }),
    recommendationRow({
      id: "rec-immersion",
      recommended_service_key: "immersion",
      recommendation_type: "application",
      title: "Validate progress in an immersion mission",
      reason: "Test transfer in real use.",
      estimated_minutes: 15,
    }),
    recommendationRow({
      id: "rec-listening",
      recommended_service_key: "listening",
      recommendation_type: "recovery",
      title: "Controlled listening recovery loop",
      reason: "Decoding needs a recovery loop.",
      estimated_minutes: 12,
    }),
  ], 25);

  assertEquals(
    planned.tasks.map((task) => task.title),
    [
      "Review due vocabulary cards",
      "Repair repeated grammar errors",
      "Validate progress in an immersion mission",
    ],
    "The hub plan should keep one review, one weakness/remediation, and one transfer/application task.",
  );
  assertEquals(planned.totalEstimatedMinutes, 25, "The hub plan should not exceed the learner time budget.");
  assertEquals(planned.tasks[2]?.estimated_minutes, 5, "The final scheduled task should be capped to the remaining minutes budget.");
  assert(
    planned.carryoverTasks.some((task) => task.title === "Controlled listening recovery loop"),
    "Unscheduled tasks should stay visible as carryover instead of disappearing.",
  );
});

Deno.test("buildHubPlanFromRecommendations keeps due review even under a tight budget", () => {
  const planned = buildHubPlanFromRecommendations([
    recommendationRow({
      id: "rec-review",
      recommended_service_key: "vocabulary",
      recommendation_type: "review",
      title: "Review due vocabulary cards",
      reason: "A review is due.",
      estimated_minutes: 12,
    }),
    recommendationRow({
      id: "rec-weakness",
      recommended_service_key: "writing",
      recommendation_type: "weakness",
      title: "Focused Writing task",
      reason: "Writing is the weakest service.",
      estimated_minutes: 10,
    }),
  ], 5);

  assertEquals(planned.totalEstimatedMinutes, 5, "The planner should cap the scheduled minutes to the total budget.");
  assertEquals(planned.tasks.length, 1, "Only the due review should fit into a five-minute plan.");
  assertEquals(planned.tasks[0]?.title, "Review due vocabulary cards", "Due vocabulary review should never be dropped.");
  assert(
    planned.carryoverTasks.some((task) => task.title === "Focused Writing task"),
    "Overflow tasks should remain as carryover for the next plan.",
  );
});

Deno.test("deriveMasteryReopenUpdate reopens stable or mastered units into unstable state", () => {
  const derived = deriveMasteryReopenUpdate(
    {
      state: "mastered",
      confidence: 0.8,
      failure_count: 1,
      reopened_count: 2,
      service_key: "writing",
      unit_key: "articles",
      skill_key: "grammar",
      metadata: { source: "seed" },
    },
    {
      reason: "Immersion transfer broke down.",
      metadata: { mission_id: "mission-airport" },
      nowIso: "2026-04-20T12:00:00.000Z",
    },
  );

  assert(derived, "Stable/mastered rows should produce a reopen update.");
  assertEquals(derived?.update.state, "unstable", "Stable mastery should reopen to unstable.");
  assertEquals(derived?.update.confidence, 0.576, "Reopened confidence should decay by the configured multiplier.");
  assertEquals(derived?.update.failure_count, 2, "Reopened mastery should increment failure count.");
  assertEquals(derived?.update.reopened_count, 3, "Reopened mastery should increment reopened count.");
  assertEquals(
    (derived?.update.metadata as Record<string, unknown>).mission_id,
    "mission-airport",
    "Extra metadata should stay attached to the reopen update.",
  );
});

Deno.test("deriveMasteryReopenUpdate ignores non-stable mastery rows", () => {
  const derived = deriveMasteryReopenUpdate(
    {
      state: "learning",
      confidence: 0.61,
      service_key: "grammar",
    },
    {
      reason: "No reopen should happen here.",
      nowIso: "2026-04-20T12:00:00.000Z",
    },
  );

  assertEquals(derived, null, "Only stable/mastered rows should reopen.");
});

Deno.test("calculateAttemptScore and buildFeedbackPayload stay deterministic and learner-facing", () => {
  const cleanAttempt = calculateAttemptScore({
    correctnessRatio: 0.85,
    correctionQualityRatio: 0.8,
    estimatedMinutes: 10,
    timeSpentSeconds: 600,
    hintUsageCount: 0,
    retryCount: 0,
  });
  const messyAttempt = calculateAttemptScore({
    correctnessRatio: 0.85,
    correctionQualityRatio: 0.8,
    estimatedMinutes: 10,
    timeSpentSeconds: 900,
    hintUsageCount: 3,
    retryCount: 2,
  });

  assert(
    messyAttempt.overallScore < cleanAttempt.overallScore,
    "Extra hints, retries, and slower completion should lower the overall score.",
  );

  const feedback = buildFeedbackPayload({
    serviceKey: "writing",
    score: 0.42,
    title: "email draft",
    issues: [
      {
        category: "grammar",
        subskill: "articles",
        explanation: "You missed articles before singular count nouns.",
        correction_hint: "Add an article before each singular count noun.",
      },
    ],
  });

  assertEquals(feedback.issues[0]?.category, "grammar", "Feedback should normalize the primary issue category.");
  assertEquals(feedback.related_drill.service_key, "grammar", "Grammar issues should point to grammar drills.");
  assert(
    feedback.handoff_targets.some((entry) => (entry as Record<string, unknown>).service_key === "speaking"),
    "Feedback should keep a transfer target alongside the direct repair route.",
  );
});

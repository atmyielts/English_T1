import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { type CoachingQuota, useAiCoaching } from "../lib/useAiCoaching";

// ─── Types ────────────────────────────────────────────────────────────────────

type GradeResult = {
  session_id: string;
  overall_band: number | null;
  criteria: { TR: number; CC: number; LR: number; GRA: number } | null;
  strengths: string[];
  improvements: string[];
  actionable_feedback: string[];
  feedback: string;
  word_count_comment: string;
  word_count: number;
  exam_type: string;
  task_type: string;
  model: string;
  graded_at: string;
  quota?: Quota | null;
};

type Quota = CoachingQuota;
type HistoryItem = {
  id: string;
  exam_type: string;
  task_type: string;
  word_count: number;
  overall_band: number | null;
  criteria: Record<string, number> | null;
  created_at: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CRITERIA_LABELS: Record<string, { short: string; full: string }> = {
  TR: { short: "TR", full: "Task Response / Completion" },
  CC: { short: "CC", full: "Coherence & Cohesion / Organization" },
  LR: { short: "LR", full: "Lexical Resource / Vocabulary" },
  GRA: { short: "GRA", full: "Grammatical Range & Accuracy" },
};

const bandColor = (band: number | null) => {
  if (band === null) return "text-gray-500";
  if (band >= 7) return "text-emerald-600";
  if (band >= 5.5) return "text-amber-600";
  return "text-red-600";
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

const IELTS_TASK2_PROMPTS = [
  "Some people believe that the best way to improve public health is to increase the number of sports facilities. Others think this is not sufficient and more fundamental changes in society are necessary. Discuss both views and give your opinion.",
  "In many countries, the number of animals and plants is declining. Why is this happening? How can this issue be addressed?",
  "The internet has changed the way people communicate. Some people argue that this change is positive, while others feel it has negative implications. Discuss both views and give your opinion.",
];

const IELTS_TASK1_PROMPTS = [
  "Fictional practice data: households with internet access in Country A: 2000: 20%, 2010: 55%, 2020: 90%. Country B: 2000: 15%, 2010: 60%, 2020: 80%. Summarise the main features and make comparisons.",
  "Fictional practice data: museum visitors (thousands) in January, February and March. History museum: 12, 15, 18. Art museum: 20, 18, 16. Science museum: 8, 12, 19. Summarise the main features and make comparisons.",
];

// ─── Result Card ──────────────────────────────────────────────────────────────

const ResultCard: React.FC<{ result: GradeResult }> = ({ result }) => (
  <div className="space-y-5">
    {/* Overall score */}
    <div className="flex items-center gap-6 p-5 bg-gray-50 rounded-2xl border border-gray-200">
      <div className="text-center">
        <div className={`text-5xl font-bold ${bandColor(result.overall_band)}`}>
          {result.overall_band !== null ? result.overall_band.toFixed(1) : "—"}
        </div>
        <div className="text-xs text-gray-500 mt-1 uppercase tracking-wide">
          Practice estimate
        </div>
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-700 mb-2">
          Criteria Breakdown
        </div>
        {result.criteria &&
          Object.entries(result.criteria).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 mb-1.5">
              <div className="text-xs font-semibold text-gray-500 w-8">{k}</div>
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full"
                  style={{
                    width: `${
                      (v / (result.exam_type === "itep" ? 6 : 9)) * 100
                    }%`,
                  }}
                />
              </div>
              <div className="text-sm font-bold text-gray-800 w-8 text-right">
                {v}
              </div>
              <div className="text-xs text-gray-500 hidden md:block">
                {CRITERIA_LABELS[k]?.full ?? k}
              </div>
            </div>
          ))}
      </div>
    </div>

    {/* Feedback */}
    {result.feedback && (
      <div className="p-4 bg-white border border-gray-200 rounded-xl">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Overall Feedback
        </div>
        <p className="text-sm text-gray-700 leading-relaxed">
          {result.feedback}
        </p>
        {result.word_count_comment && (
          <p className="text-xs text-gray-500 mt-2 italic">
            {result.word_count_comment}
          </p>
        )}
      </div>
    )}

    {/* Strengths & Improvements */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {result.strengths.length > 0 && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">
            Strengths
          </div>
          <ul className="space-y-1">
            {result.strengths.map((s, i) => (
              <li key={i} className="text-sm text-emerald-800 flex gap-2">
                <span>✓</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.improvements.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
            Areas to Improve
          </div>
          <ul className="space-y-1">
            {result.improvements.map((s, i) => (
              <li key={i} className="text-sm text-amber-800 flex gap-2">
                <span>→</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>

    {/* Actionable tips */}
    {result.actionable_feedback.length > 0 && (
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">
          Actionable Tips
        </div>
        <ol className="space-y-1.5">
          {result.actionable_feedback.map((s, i) => (
            <li key={i} className="text-sm text-blue-800 flex gap-2">
              <span className="font-bold">{i + 1}.</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </div>
    )}

    <div className="text-xs text-gray-500 text-right">
      {result.word_count} words · Graded {fmtDate(result.graded_at)}
      {result.quota && <>· {result.quota.used}/{result.quota.limit} today</>}
    </div>
  </div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────

export const WritingTutorPage: React.FC = () => {
  const navigate = useNavigate();
  const [examType, setExamType] = useState<"ielts" | "itep">("ielts");
  const [taskType, setTaskType] = useState<"task1" | "task2">("task2");
  const [promptText, setPromptText] = useState("");
  const [essayText, setEssayText] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const coach = useAiCoaching<GradeResult, HistoryItem>("writing-tutor", () => {
    setEssayText("");
    setPromptText("");
  });
  const {
    quota,
    history,
    quotaError,
    historyError,
    result,
    error,
    pending,
    refreshQuota,
    refreshHistory,
    checkResult,
  } = coach;
  const grading = coach.busy, loadingInit = coach.loading;
  const wordCount = essayText.trim().split(/\s+/).filter(Boolean).length;
  const grade = () =>
    coach.submit({
      essay: essayText.trim(),
      prompt: promptText.trim(),
      exam_type: examType,
      task_type: taskType,
    });
  const updateInput = (update: () => void) => {
    update();
    coach.clearResult();
  };
  const choosePrompt = (p: string) => updateInput(() => setPromptText(p));

  if (loadingInit) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-500">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-5">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <button
              onClick={() => navigate(-1)}
              className="text-xs text-gray-500 mb-1 block"
            >
              ← Back
            </button>
            <h1 className="text-xl font-bold text-gray-900">
              AI Writing Tutor
            </h1>
            <p className="text-sm text-gray-500">
              AI practice estimates and writing feedback. Scores are not
              official exam results.
            </p>
          </div>
          {quota && (
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900">
                {quota.remaining}
              </div>
              <div className="text-xs text-gray-500">
                {quota.has_paid_access ? "AI add-on requests" : "free requests"}
                {" "}
                left today
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Resets at midnight UTC
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {quotaError && (
          <div role="alert" className="mb-4 text-sm text-red-700">
            {quotaError}{" "}
            <button onClick={refreshQuota} className="underline">
              Retry allowance
            </button>
          </div>
        )}
        {quota && !quota.enabled && (
          <p role="status" className="mb-4 text-sm text-gray-700">
            AI grading is temporarily unavailable. You can keep working on your
            draft.
          </p>
        )}
        {/* Config row */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <div>
            <label
              htmlFor="writing-exam"
              className="block text-xs font-semibold text-gray-600 mb-1"
            >
              Test Type
            </label>
            <select
              id="writing-exam"
              disabled={grading || pending}
              value={examType}
              onChange={(e) =>
                updateInput(() =>
                  setExamType(e.target.value as "ielts" | "itep")
                )}
              className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none"
            >
              <option value="ielts">IELTS Academic</option>
              <option value="itep">iTEP Academic</option>
            </select>
          </div>
          {examType === "ielts" && (
            <div>
              <label
                htmlFor="writing-task"
                className="block text-xs font-semibold text-gray-600 mb-1"
              >
                Task
              </label>
              <select
                id="writing-task"
                disabled={grading || pending}
                value={taskType}
                onChange={(e) =>
                  updateInput(() =>
                    setTaskType(e.target.value as "task1" | "task2")
                  )}
                className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none"
              >
                <option value="task2">Task 2 (Essay)</option>
                <option value="task1">Task 1 (Report)</option>
              </select>
            </div>
          )}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="ml-auto self-end px-3 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50"
          >
            {showHistory ? "Hide" : "History"} ({history.length})
          </button>
        </div>

        {historyError && (
          <div role="alert" className="mb-4 text-sm text-red-700">
            {historyError}{" "}
            <button onClick={refreshHistory} className="underline">
              Retry history
            </button>
          </div>
        )}
        {showHistory && !historyError && history.length === 0 && (
          <p className="mb-4 text-sm text-gray-600">No saved feedback yet.</p>
        )}
        {/* History */}
        {showHistory && history.length > 0 && (
          <div className="mb-5 bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
            {history.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 last:border-0"
              >
                <div>
                  <span className="font-medium text-gray-800">
                    {h.exam_type?.toUpperCase()} {h.task_type}
                  </span>
                  <span className="text-gray-500 ml-2">{h.word_count}w</span>
                </div>
                <div className="flex items-center gap-3">
                  {h.overall_band !== null && (
                    <span className={`font-bold ${bandColor(h.overall_band)}`}>
                      {h.overall_band}
                    </span>
                  )}
                  <span className="text-xs text-gray-500">
                    {fmtDate(h.created_at)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Prompt */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <label
              htmlFor="writing-prompt"
              className="text-xs font-semibold text-gray-600"
            >
              Writing task and source figures (required)
            </label>
            <div className="flex gap-1">
              {(examType === "itep" || taskType === "task2"
                ? IELTS_TASK2_PROMPTS
                : IELTS_TASK1_PROMPTS).slice(0, 2).map((p, i) => (
                  <button
                    disabled={grading || pending}
                    key={i}
                    onClick={() => choosePrompt(p)}
                    className="text-xs px-2 py-1 border border-gray-200 rounded-lg hover:bg-gray-50"
                  >
                    Sample {i + 1}
                  </button>
                ))}
            </div>
          </div>
          <textarea
            id="writing-prompt"
            readOnly={grading || pending}
            maxLength={5000}
            value={promptText}
            onChange={(e) => updateInput(() => setPromptText(e.target.value))}
            rows={3}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200"
            placeholder="Paste the exam question here…"
          />
        </div>

        {/* Essay */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <label
              htmlFor="writing-essay"
              className="text-xs font-semibold text-gray-600"
            >
              Your Essay *
            </label>
            <span
              className={`text-xs font-medium ${
                wordCount < 150
                  ? "text-red-700"
                  : wordCount > 300
                  ? "text-emerald-600"
                  : "text-amber-700"
              }`}
            >
              {wordCount} words
            </span>
          </div>
          <textarea
            id="writing-essay"
            readOnly={grading || pending}
            maxLength={20000}
            value={essayText}
            onChange={(e) => updateInput(() => setEssayText(e.target.value))}
            rows={14}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 font-mono leading-relaxed"
            placeholder="Paste or type your essay here…"
          />
          <div className="text-xs text-gray-500 mt-1">
            {examType === "ielts"
              ? (taskType === "task2"
                ? "Minimum 250 words recommended."
                : "Minimum 150 words recommended.")
              : "Approximately 150–300 words."}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {pending && (
          <div className="mb-4 p-4 rounded-xl border border-amber-300 bg-amber-50 text-sm space-y-3">
            <p>
              A previous request needs checking. Drafts stay on this page but
              are not saved across reloads.
            </p>
            <p className="break-all text-xs">Request: {coach.requestId}</p>
            <button
              disabled={grading}
              onClick={checkResult}
              className="underline font-semibold mr-4"
            >
              Check saved result
            </button>
            <p>
              Starting again may use another request from your daily allowance.
            </p>
            <button
              disabled={grading}
              onClick={coach.startSeparate}
              className="underline"
            >
              Start a separate request
            </button>
          </div>
        )}
        <button
          onClick={grade}
          disabled={grading || pending || essayText.trim().length < 50 ||
            promptText.trim().length < 10 || !quota?.enabled ||
            quota.api_version !== 2 || quota.remaining === 0 ||
            quota.attempts_remaining === 0}
          className="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold hover:bg-black disabled:bg-gray-300 disabled:cursor-not-allowed mb-6"
        >
          {grading
            ? "✍ Grading your essay…"
            : quota?.remaining === 0
            ? "Daily limit reached"
            : `Grade with AI (${quota?.remaining ?? "—"} left)`}
        </button>

        {/* Result */}
        {result && <ResultCard result={result} />}

        {quota?.addon_available && !quota.has_paid_access && (
          <p className="mt-6 text-sm text-gray-600">
            Higher daily allowance requires the dedicated AI add-on. Other
            Schood purchases do not include it.
          </p>
        )}
      </div>
    </div>
  );
};

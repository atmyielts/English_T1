import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAiCoaching } from "../lib/useAiCoaching";
import { useTranscriptDictation } from "../lib/useTranscriptDictation";

type Result = {
  session_id: string;
  assessment_scope: "transcript_only";
  observations: { coherence: string; vocabulary: string; grammar: string };
  strengths: string[];
  improvements: string[];
  feedback: string;
  word_count: number;
};
type HistoryItem = {
  id: string;
  topic: string;
  task_type: string;
  assessment_scope: string;
  word_count: number;
  created_at: string;
};
type Task = "part1" | "part2" | "part3" | "free";
const TOPICS: Record<Task, string[]> = {
  part1: [
    "Describe your hometown.",
    "Talk about your favourite season.",
    "Describe your daily routine.",
  ],
  part2: [
    "Describe a place you found interesting.",
    "Describe a person who has influenced you.",
    "Describe a book or film that impressed you.",
  ],
  part3: [
    "How might cities change in the future?",
    "What role does technology play in education?",
    "How has globalisation affected local cultures?",
  ],
  free: [
    "Talk about something you learned recently.",
    "Explain an idea you care about.",
  ],
};
export const SpeakingCoachPage: React.FC = () => {
  const navigate = useNavigate();
  const [task, setTask] = useState<Task>("part2"),
    [topic, setTopic] = useState(""),
    [transcript, setTranscript] = useState("");
  const dictation = useTranscriptDictation(transcript, setTranscript);
  const coach = useAiCoaching<Result, HistoryItem>("speaking-coach", () => {
    dictation.cancel();
    setTranscript("");
    setTopic("");
  });
  const locked = coach.busy || coach.pending || dictation.recording;
  const updateInput = (update: () => void) => {
    update();
    coach.clearResult();
  };
  const canSubmit = !locked && coach.quota?.enabled &&
    coach.quota.api_version === 2 && coach.quota.remaining > 0 &&
    coach.quota.attempts_remaining > 0 && transcript.trim().length >= 20 &&
    topic.trim().length >= 5;
  const words = transcript.trim().split(/\s+/).filter(Boolean).length;
  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <header className="bg-white border-b border-gray-200 px-4 py-5">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-gray-600 mb-2 underline"
          >
            Back
          </button>
          <h1 className="text-xl font-bold text-gray-900">AI Speaking Coach</h1>
          <p className="text-sm text-gray-600 mt-2">
            Practise an answer, then get feedback on the ideas, vocabulary and
            grammar in its transcript.
          </p>
          <p className="text-sm text-gray-600 mt-2">
            This reviews text only. Pronunciation, oral fluency and an overall
            IELTS Speaking band require audio assessment.
          </p>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {coach.loading && (
          <p role="status">Loading your allowance and history…</p>
        )}
        {coach.quotaError && (
          <div role="alert" className="text-sm text-red-700">
            {coach.quotaError}{" "}
            <button onClick={coach.refreshQuota} className="underline">
              Retry allowance
            </button>
          </div>
        )}
        {coach.quota && (
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
            <p>
              <strong>{coach.quota.remaining} of {coach.quota.limit}</strong>
              {" "}
              {coach.quota.has_paid_access ? "AI add-on" : "free"}{" "}
              requests remaining today. Resets at midnight UTC.
            </p>
            {!coach.quota.enabled && (
              <p role="status" className="mt-2">
                AI feedback is temporarily unavailable. You can continue
                drafting.
              </p>
            )}
            {coach.quota.addon_available && !coach.quota.has_paid_access && (
              <p className="mt-2">
                Higher allowance requires the dedicated AI add-on. Other
                purchases do not include it.
              </p>
            )}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
          <div>
            <label
              htmlFor="speaking-task"
              className="block text-sm font-semibold text-gray-700 mb-1"
            >
              Practice task
            </label>
            <select
              id="speaking-task"
              disabled={locked}
              value={task}
              onChange={(e) =>
                updateInput(() => setTask(e.target.value as Task))}
              className="w-full border border-gray-300 rounded-xl p-3 text-sm"
            >
              <option value="part1">Part 1: Introduction</option>
              <option value="part2">Part 2: Long turn</option>
              <option value="part3">Part 3: Discussion</option>
              <option value="free">Free practice</option>
            </select>
          </div>
          <div className="min-w-0">
            <label
              htmlFor="speaking-topic"
              className="block text-sm font-semibold text-gray-700 mb-1"
            >
              Topic or question
            </label>
            <input
              id="speaking-topic"
              readOnly={locked}
              maxLength={2000}
              value={topic}
              onChange={(e) => updateInput(() => setTopic(e.target.value))}
              className="w-full border border-gray-300 rounded-xl p-3 text-sm"
              placeholder="What will you talk about?"
            />
          </div>
        </div>
        <div>
          <label
            htmlFor="speaking-sample"
            className="block text-sm text-gray-600 mb-1"
          >
            Try a sample topic
          </label>
          <select
            id="speaking-sample"
            disabled={locked}
            value=""
            onChange={(e) => updateInput(() => setTopic(e.target.value))}
            className="max-w-full w-full border border-gray-300 rounded-xl p-3 text-sm"
          >
            <option value="">Choose a topic…</option>
            {TOPICS[task].map((text) => (
              <option key={text} value={text}>{text}</option>
            ))}
          </select>
        </div>
        <section aria-label="Dictation" className="space-y-3">
          <p className="text-sm text-gray-600">
            You can type, paste or dictate your answer. Browser dictation may
            send audio to your browser’s speech service. Schood sends the
            transcript to its AI provider when you request feedback.
          </p>
          {dictation.supported
            ? (
              <button
                disabled={coach.busy || coach.pending}
                onClick={() => {
                  coach.clearResult();
                  if (dictation.recording) dictation.stop();
                  else dictation.start();
                }}
                className="px-5 py-3 rounded-xl bg-gray-900 text-white font-semibold text-sm disabled:bg-gray-500"
              >
                {dictation.recording ? "Stop dictation" : "Start dictation"}
              </button>
            )
            : (
              <p className="text-sm text-gray-600">
                Dictation is unavailable in this browser. Type or paste your
                transcript below.
              </p>
            )}
          {dictation.recording && (
            <p role="status" className="text-sm text-red-700">
              Dictating · {Math.floor(dictation.elapsed / 60)}:{String(
                dictation.elapsed % 60,
              ).padStart(2, "0")}
            </p>
          )}
          {dictation.error && (
            <p role="alert" className="text-sm text-red-700">
              {dictation.error}
            </p>
          )}
        </section>
        <div>
          <label
            htmlFor="speaking-transcript"
            className="block text-sm font-semibold text-gray-700 mb-1"
          >
            Your transcript <span className="font-normal">({words} words)</span>
          </label>
          <textarea
            id="speaking-transcript"
            readOnly={locked}
            maxLength={20000}
            value={transcript}
            onChange={(e) => updateInput(() => setTranscript(e.target.value))}
            rows={9}
            className="w-full border border-gray-300 rounded-xl p-3 text-sm leading-relaxed"
            placeholder="Type or paste your answer…"
          />
          <p className="text-xs text-gray-600 mt-1">
            Use 20–20,000 characters and a topic of at least 5 characters. Check
            dictated text for recognition mistakes. Drafts are not saved across
            reloads.
          </p>
        </div>
        {coach.error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          >
            {coach.error}
          </div>
        )}
        {coach.pending && (
          <section
            aria-label="Request recovery"
            className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm space-y-3"
          >
            <p>
              A previous request needs checking. Your transcript stays on this
              page.
            </p>
            <p className="break-all text-xs">Request: {coach.requestId}</p>
            <button
              disabled={coach.busy}
              onClick={coach.checkResult}
              className="underline font-semibold"
            >
              Check saved result
            </button>
            <p>
              Starting again may use another request from your daily allowance.
            </p>
            <button
              disabled={coach.busy}
              onClick={coach.startSeparate}
              className="underline"
            >
              Start a separate request
            </button>
          </section>
        )}
        <button
          disabled={!canSubmit}
          onClick={() =>
            coach.submit({
              transcript: transcript.trim(),
              topic: topic.trim(),
              task_type: task,
              duration_secs: null,
            })}
          className="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold disabled:bg-gray-500 disabled:cursor-not-allowed"
        >
          {coach.busy ? "Checking feedback…" : coach.quota?.remaining === 0 ||
              coach.quota?.attempts_remaining === 0
            ? "Daily allowance reached"
            : "Get transcript feedback"}
        </button>
        {coach.result && (
          <section aria-label="Transcript feedback" className="space-y-4">
            <h2 className="text-lg font-semibold">
              Feedback on your transcript
            </h2>
            <p className="text-sm text-gray-600">
              Text evidence only · {coach.result.word_count}{" "}
              words · No overall Speaking score
            </p>
            <p className="bg-white rounded-xl border border-gray-200 p-4 text-sm leading-relaxed">
              {coach.result.feedback}
            </p>
            {Object.entries(coach.result.observations).map(([name, text]) => (
              <div
                key={name}
                className="bg-white rounded-xl border border-gray-200 p-4"
              >
                <h3 className="font-semibold capitalize mb-2">
                  {name === "coherence" ? "Coherence of ideas" : name}
                </h3>
                <p className="text-sm leading-relaxed">{text}</p>
              </div>
            ))}
            <div className="grid gap-4 sm:grid-cols-2">
              {(["strengths", "improvements"] as const).map((kind) =>
                coach.result![kind].length > 0 && (
                  <div
                    key={kind}
                    className="rounded-xl border border-gray-200 p-4"
                  >
                    <h3 className="font-semibold capitalize mb-2">{kind}</h3>
                    <ul className="list-disc pl-5 space-y-2 text-sm">
                      {coach.result![kind].map((text, i) => (
                        <li key={i}>{text}</li>
                      ))}
                    </ul>
                  </div>
                )
              )}
            </div>
          </section>
        )}
        {coach.historyError && (
          <div role="alert" className="text-sm text-red-700">
            {coach.historyError}{" "}
            <button onClick={coach.refreshHistory} className="underline">
              Retry history
            </button>
          </div>
        )}
        <section
          aria-label="Recent sessions"
          className="rounded-xl border border-gray-200 bg-white p-4"
        >
          <h2 className="font-semibold mb-3">Recent sessions</h2>
          {!coach.loading && !coach.historyError &&
            coach.history.length === 0 && (
            <p className="text-sm text-gray-600">No saved feedback yet.</p>
          )}
          <ul className="space-y-3">
            {coach.history.map((item) => (
              <li
                key={item.id}
                className="border-b border-gray-100 pb-3 text-sm break-words"
              >
                <p className="font-medium">{item.topic || item.task_type}</p>
                <p className="text-gray-600 mt-1">
                  {new Date(item.created_at).toLocaleDateString()} ·{" "}
                  {item.word_count} words ·{" "}
                  {item.assessment_scope === "transcript_only"
                    ? "Transcript feedback"
                    : "Earlier session — audio scoring unverified"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const edgeBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

// ─── Types ────────────────────────────────────────────────────────────────────

type GradeResult = {
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
  quota: { used: number; limit: number; has_paid_access: boolean };
};

type Quota = { used: number; limit: number; remaining: number; has_paid_access: boolean };

type HistoryItem = { id: string; exam_type: string; task_type: string; word_count: number; overall_band: number | null; criteria: Record<string, number> | null; created_at: string };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CRITERIA_LABELS: Record<string, { short: string; full: string }> = {
  TR: { short: 'TR', full: 'Task Response / Completion' },
  CC: { short: 'CC', full: 'Coherence & Cohesion / Organization' },
  LR: { short: 'LR', full: 'Lexical Resource / Vocabulary' },
  GRA: { short: 'GRA', full: 'Grammatical Range & Accuracy' },
};

const bandColor = (band: number | null) => {
  if (band === null) return 'text-gray-500';
  if (band >= 7) return 'text-emerald-600';
  if (band >= 5.5) return 'text-amber-600';
  return 'text-red-600';
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

const IELTS_TASK2_PROMPTS = [
  'Some people believe that the best way to improve public health is to increase the number of sports facilities. Others think this is not sufficient and more fundamental changes in society are necessary. Discuss both views and give your opinion.',
  'In many countries, the number of animals and plants is declining. Why is this happening? How can this issue be addressed?',
  'The internet has changed the way people communicate. Some people argue that this change is positive, while others feel it has negative implications. Discuss both views and give your opinion.',
];

const IELTS_TASK1_PROMPTS = [
  'The graph below shows changes in the percentage of households with different types of technology in a European country between 1990 and 2010. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
  'The chart below shows information about the number of visitors to three different museums in a city over a period of six months. Summarise the information by selecting and reporting the main features, and make comparisons where relevant.',
];

// ─── Result Card ──────────────────────────────────────────────────────────────

const ResultCard: React.FC<{ result: GradeResult }> = ({ result }) => (
  <div className="space-y-5">
    {/* Overall score */}
    <div className="flex items-center gap-6 p-5 bg-gray-50 rounded-2xl border border-gray-200">
      <div className="text-center">
        <div className={`text-5xl font-bold ${bandColor(result.overall_band)}`}>
          {result.overall_band !== null ? result.overall_band.toFixed(1) : '—'}
        </div>
        <div className="text-xs text-gray-500 mt-1 uppercase tracking-wide">Overall Band</div>
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-700 mb-2">Criteria Breakdown</div>
        {result.criteria && Object.entries(result.criteria).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 mb-1.5">
            <div className="text-xs font-semibold text-gray-500 w-8">{k}</div>
            <div className="flex-1 bg-gray-200 rounded-full h-2">
              <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${(v / 9) * 100}%` }} />
            </div>
            <div className="text-sm font-bold text-gray-800 w-8 text-right">{v}</div>
            <div className="text-xs text-gray-400 hidden md:block">{CRITERIA_LABELS[k]?.full ?? k}</div>
          </div>
        ))}
      </div>
    </div>

    {/* Feedback */}
    {result.feedback && (
      <div className="p-4 bg-white border border-gray-200 rounded-xl">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Overall Feedback</div>
        <p className="text-sm text-gray-700 leading-relaxed">{result.feedback}</p>
        {result.word_count_comment && <p className="text-xs text-gray-400 mt-2 italic">{result.word_count_comment}</p>}
      </div>
    )}

    {/* Strengths & Improvements */}
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {result.strengths.length > 0 && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
          <div className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">Strengths</div>
          <ul className="space-y-1">{result.strengths.map((s, i) => <li key={i} className="text-sm text-emerald-800 flex gap-2"><span>✓</span><span>{s}</span></li>)}</ul>
        </div>
      )}
      {result.improvements.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Areas to Improve</div>
          <ul className="space-y-1">{result.improvements.map((s, i) => <li key={i} className="text-sm text-amber-800 flex gap-2"><span>→</span><span>{s}</span></li>)}</ul>
        </div>
      )}
    </div>

    {/* Actionable tips */}
    {result.actionable_feedback.length > 0 && (
      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-2">Actionable Tips</div>
        <ol className="space-y-1.5">{result.actionable_feedback.map((s, i) => <li key={i} className="text-sm text-blue-800 flex gap-2"><span className="font-bold">{i + 1}.</span><span>{s}</span></li>)}</ol>
      </div>
    )}

    <div className="text-xs text-gray-400 text-right">{result.word_count} words · Graded {fmtDate(result.graded_at)} · {result.quota.used}/{result.quota.limit} today</div>
  </div>
);

// ─── Main Page ────────────────────────────────────────────────────────────────

export const WritingTutorPage: React.FC = () => {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loadingInit, setLoadingInit] = useState(true);

  const [examType, setExamType] = useState<'ielts' | 'itep'>('ielts');
  const [taskType, setTaskType] = useState<'task1' | 'task2'>('task2');
  const [promptText, setPromptText] = useState('');
  const [essayText, setEssayText] = useState('');
  const [grading, setGrading] = useState(false);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const wordCount = essayText.trim().split(/\s+/).filter(Boolean).length;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { navigate('/auth?returnTo=/writing-tutor', { replace: true }); return; }
      const tok = data.session.access_token;
      setToken(tok);
      Promise.all([
        fetch(`${edgeBase}/writing-tutor?action=quota`, { headers: { Authorization: `Bearer ${tok}` } }).then((r) => r.json()),
        fetch(`${edgeBase}/writing-tutor?action=history`, { headers: { Authorization: `Bearer ${tok}` } }).then((r) => r.json()),
      ]).then(([q, h]) => {
        setQuota(q);
        setHistory(h.sessions ?? []);
      }).catch(() => null).finally(() => setLoadingInit(false));
    });
  }, [navigate]);

  const grade = async () => {
    if (!token || !essayText.trim()) return;
    setGrading(true); setError(null); setResult(null);
    try {
      const res = await fetch(`${edgeBase}/writing-tutor`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'grade', essay: essayText, prompt: promptText, exam_type: examType, task_type: taskType }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Grading failed'); return; }
      setResult(data);
      if (quota) setQuota((q) => q ? { ...q, used: q.used + 1, remaining: q.remaining - 1 } : q);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to grade');
    } finally {
      setGrading(false);
    }
  };

  const usePrompt = (p: string) => setPromptText(p);

  if (loadingInit) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Loading…</div></div>;

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-5">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <button onClick={() => navigate(-1)} className="text-xs text-gray-400 mb-1 block">← Back</button>
            <h1 className="text-xl font-bold text-gray-900">AI Writing Tutor</h1>
            <p className="text-sm text-gray-500">Get instant IELTS / iTEP band score + detailed feedback</p>
          </div>
          {quota && (
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900">{quota.remaining}</div>
              <div className="text-xs text-gray-400">{quota.has_paid_access ? 'premium sessions' : 'free sessions'} left today</div>
              {!quota.has_paid_access && <div className="text-xs text-blue-600 mt-1">Upgrade for {20}/day</div>}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Config row */}
        <div className="flex gap-3 mb-4 flex-wrap">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Test Type</label>
            <select value={examType} onChange={(e) => setExamType(e.target.value as 'ielts' | 'itep')} className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none">
              <option value="ielts">IELTS Academic</option>
              <option value="itep">iTEP Academic</option>
            </select>
          </div>
          {examType === 'ielts' && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Task</label>
              <select value={taskType} onChange={(e) => setTaskType(e.target.value as 'task1' | 'task2')} className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none">
                <option value="task2">Task 2 (Essay)</option>
                <option value="task1">Task 1 (Report)</option>
              </select>
            </div>
          )}
          <button onClick={() => setShowHistory(!showHistory)} className="ml-auto self-end px-3 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">
            {showHistory ? 'Hide' : 'History'} ({history.length})
          </button>
        </div>

        {/* History */}
        {showHistory && history.length > 0 && (
          <div className="mb-5 bg-white rounded-2xl border border-gray-200 p-4 space-y-2">
            {history.map((h) => (
              <div key={h.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 last:border-0">
                <div>
                  <span className="font-medium text-gray-800">{h.exam_type?.toUpperCase()} {h.task_type}</span>
                  <span className="text-gray-400 ml-2">{h.word_count}w</span>
                </div>
                <div className="flex items-center gap-3">
                  {h.overall_band && <span className={`font-bold ${bandColor(h.overall_band)}`}>{h.overall_band}</span>}
                  <span className="text-xs text-gray-400">{fmtDate(h.created_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Prompt */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-gray-600">Question / Prompt (optional but improves accuracy)</label>
            <div className="flex gap-1">
              {(examType === 'ielts' && taskType === 'task2' ? IELTS_TASK2_PROMPTS : IELTS_TASK1_PROMPTS).slice(0, 2).map((p, i) => (
                <button key={i} onClick={() => usePrompt(p)} className="text-xs px-2 py-1 border border-gray-200 rounded-lg hover:bg-gray-50">Sample {i + 1}</button>
              ))}
            </div>
          </div>
          <textarea value={promptText} onChange={(e) => setPromptText(e.target.value)} rows={3} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200" placeholder="Paste the exam question here…" />
        </div>

        {/* Essay */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-gray-600">Your Essay *</label>
            <span className={`text-xs font-medium ${wordCount < 150 ? 'text-red-500' : wordCount > 300 ? 'text-emerald-600' : 'text-amber-500'}`}>{wordCount} words</span>
          </div>
          <textarea
            value={essayText} onChange={(e) => setEssayText(e.target.value)} rows={14}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 font-mono leading-relaxed"
            placeholder="Paste or type your essay here…"
          />
          <div className="text-xs text-gray-400 mt-1">
            {examType === 'ielts' ? (taskType === 'task2' ? 'Minimum 250 words recommended.' : 'Minimum 150 words recommended.') : 'Approximately 150–300 words.'}
          </div>
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

        <button
          onClick={grade}
          disabled={grading || !essayText.trim() || (quota?.remaining === 0)}
          className="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold hover:bg-black disabled:bg-gray-300 disabled:cursor-not-allowed mb-6"
        >
          {grading ? '✍ Grading your essay…' : quota?.remaining === 0 ? 'Daily limit reached' : `Grade with AI (${quota?.remaining ?? '—'} left)`}
        </button>

        {/* Result */}
        {result && <ResultCard result={result} />}

        {/* Upgrade prompt */}
        {!quota?.has_paid_access && (
          <div className="mt-6 p-5 bg-gradient-to-br from-emerald-50 to-blue-50 border border-emerald-200 rounded-2xl text-center">
            <div className="font-semibold text-gray-900 mb-1">Get unlimited writing feedback</div>
            <div className="text-sm text-gray-600 mb-3">Upgrade to a Schood plan for 20 AI writing sessions per day, detailed rubric feedback, and band score history tracking.</div>
            <button onClick={() => window.location.href = '/pricing'} className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-semibold text-sm hover:bg-emerald-700">View Plans</button>
          </div>
        )}
      </div>
    </div>
  );
};

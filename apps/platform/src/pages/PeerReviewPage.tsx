import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const edgeBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

type Submission = { id: string; exam_type: string; task_type: string; prompt_text: string | null; essay_text?: string; word_count: number; status: string; reviews_count: number; reviews_needed: number; created_at: string };
type Review = { id: string; submission_id?: string; band_score: number | null; criteria: Record<string, number> | null; strengths: string | null; improvements: string | null; overall_comment: string | null; is_helpful?: boolean | null; created_at: string; peer_review_submissions?: any };

export const PeerReviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [view, setView] = useState<'submit' | 'review' | 'mine'>('mine');
  const [loading, setLoading] = useState(false);

  // Submit form
  const [essay, setEssay] = useState('');
  const [prompt, setPrompt] = useState('');
  const [examType, setExamType] = useState('ielts');
  const [taskType, setTaskType] = useState('task2');
  const [submitting, setSubmitting] = useState(false);
  const [submitDone, setSubmitDone] = useState(false);

  // Review queue
  const [queue, setQueue] = useState<Submission[]>([]);
  const [reviewing, setReviewing] = useState<Submission | null>(null);
  const [reviewForm, setReviewForm] = useState({ band_score: '', overall_comment: '', strengths: '', improvements: '' });
  const [submitReviewing, setSubmitReviewing] = useState(false);

  // My submissions
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [reviewsFor, setReviewsFor] = useState<Review[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { navigate('/auth?returnTo=/peer-review', { replace: true }); return; }
      setToken(data.session.access_token);
    });
  }, [navigate]);

  const loadMine = async (tok: string) => {
    setLoading(true);
    const [mySubs, myRev] = await Promise.all([
      fetch(`${edgeBase}/peer-review`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'my_submissions' }) }).then((r) => r.json()),
      fetch(`${edgeBase}/peer-review`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'my_reviews' }) }).then((r) => r.json()),
    ]);
    setMySubmissions(mySubs.submissions ?? []);
    setMyReviews(myRev.reviews ?? []);
    setReviewsFor(mySubs.reviews ?? []);
    setLoading(false);
  };

  const loadQueue = async (tok: string) => {
    setLoading(true);
    const r = await fetch(`${edgeBase}/peer-review`, { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'queue' }) }).then((r) => r.json());
    setQueue(r.submissions ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (!token) return;
    if (view === 'mine') loadMine(token);
    if (view === 'review') loadQueue(token);
  }, [token, view]);

  const submit = async () => {
    if (!token || !essay.trim()) return;
    setSubmitting(true);
    const res = await fetch(`${edgeBase}/peer-review`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit', essay_text: essay, prompt_text: prompt || null, exam_type: examType, task_type: taskType }) }).then((r) => r.json());
    if (res.submission) { setSubmitDone(true); setEssay(''); setPrompt(''); if (token) loadMine(token); }
    setSubmitting(false);
  };

  const openReview = async (sub: Submission) => {
    if (!token) return;
    const full = await fetch(`${edgeBase}/peer-review?action=get_submission&submission_id=${sub.id}`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.json());
    setReviewing(full.submission ?? sub);
    setReviewForm({ band_score: '', overall_comment: '', strengths: '', improvements: '' });
  };

  const submitReview = async () => {
    if (!token || !reviewing) return;
    setSubmitReviewing(true);
    await fetch(`${edgeBase}/peer-review`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'submit_review', submission_id: reviewing.id, band_score: reviewForm.band_score ? Number(reviewForm.band_score) : null, overall_comment: reviewForm.overall_comment, strengths: reviewForm.strengths, improvements: reviewForm.improvements }) });
    setReviewing(null); loadQueue(token);
    setSubmitReviewing(false);
  };

  const wordCount = essay.split(/\s+/).filter(Boolean).length;
  const fmtDate = (s: string) => new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="bg-white border-b border-gray-200 px-4 py-5">
        <div className="max-w-3xl mx-auto">
          <button onClick={() => navigate(-1)} className="text-xs text-gray-400 mb-1 block">← Back</button>
          <h1 className="text-xl font-bold text-gray-900">Peer Writing Review</h1>
          <p className="text-sm text-gray-500">Submit your essay for peer feedback · Review others' work</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-gray-200">
          {[{ key: 'mine', label: 'My Submissions' }, { key: 'review', label: 'Review Queue' }, { key: 'submit', label: 'Submit Essay' }].map((t) => (
            <button key={t.key} onClick={() => setView(t.key as any)} className={`px-5 py-2.5 text-sm font-medium border-b-2 -mb-px ${view === t.key ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>{t.label}</button>
          ))}
        </div>

        {/* Submit */}
        {view === 'submit' && (
          <div className="space-y-4">
            {submitDone && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">Submitted! Other students will review it soon.</div>}
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-semibold text-gray-600 mb-1">Exam Type</label><select value={examType} onChange={(e) => setExamType(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"><option value="ielts">IELTS</option><option value="itep">iTEP</option></select></div>
              <div><label className="block text-xs font-semibold text-gray-600 mb-1">Task</label><select value={taskType} onChange={(e) => setTaskType(e.target.value)} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm"><option value="task2">Task 2 (Essay)</option><option value="task1">Task 1 (Report)</option></select></div>
            </div>
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Question (optional)</label><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={2} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="Paste the exam question…" /></div>
            <div>
              <div className="flex justify-between mb-1"><label className="text-xs font-semibold text-gray-600">Your Essay *</label><span className={`text-xs ${wordCount < 200 ? 'text-red-500' : 'text-emerald-600'}`}>{wordCount} words</span></div>
              <textarea value={essay} onChange={(e) => setEssay(e.target.value)} rows={12} className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none font-mono leading-relaxed" placeholder="Paste your essay here…" />
            </div>
            <button onClick={submit} disabled={submitting || !essay.trim()} className="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold text-sm disabled:bg-gray-300 hover:bg-black">{submitting ? 'Submitting…' : 'Submit for Peer Review'}</button>
          </div>
        )}

        {/* Review queue */}
        {view === 'review' && !reviewing && (
          <div>
            {loading ? <div className="text-gray-400">Loading…</div> : queue.length === 0 ? (
              <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">No essays waiting for review right now. Check back later!</div>
            ) : (
              <div className="space-y-3">
                {queue.map((s) => (
                  <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
                    <div><div className="font-medium text-gray-900 text-sm">{s.exam_type?.toUpperCase()} {s.task_type}</div><div className="text-xs text-gray-400">{s.word_count} words · {fmtDate(s.created_at)}</div>{s.prompt_text && <div className="text-xs text-gray-600 mt-1 truncate max-w-xs">{s.prompt_text.slice(0, 80)}…</div>}</div>
                    <button onClick={() => openReview(s)} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-xl hover:bg-black">Review</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Review form */}
        {view === 'review' && reviewing && (
          <div className="space-y-4">
            <div className="flex items-center justify-between"><div className="text-sm font-semibold text-gray-700">Reviewing: {reviewing.exam_type?.toUpperCase()} {reviewing.task_type}</div><button onClick={() => setReviewing(null)} className="text-sm text-gray-400 hover:text-gray-600">← Back to queue</button></div>
            {reviewing.prompt_text && <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800"><strong>Question:</strong> {reviewing.prompt_text}</div>}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 max-h-60 overflow-y-auto text-sm text-gray-700 leading-relaxed font-mono">{(reviewing as any).essay_text}</div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-semibold text-gray-600 mb-1">Band Score (optional)</label><input type="number" min={1} max={9} step={0.5} value={reviewForm.band_score} onChange={(e) => setReviewForm((f) => ({ ...f, band_score: e.target.value }))} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm" /></div>
            </div>
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Strengths</label><textarea value={reviewForm.strengths} onChange={(e) => setReviewForm((f) => ({ ...f, strengths: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" /></div>
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Areas to Improve</label><textarea value={reviewForm.improvements} onChange={(e) => setReviewForm((f) => ({ ...f, improvements: e.target.value }))} rows={2} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" /></div>
            <div><label className="block text-xs font-semibold text-gray-600 mb-1">Overall Comment *</label><textarea value={reviewForm.overall_comment} onChange={(e) => setReviewForm((f) => ({ ...f, overall_comment: e.target.value }))} rows={4} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="Give constructive, specific feedback…" /></div>
            <button onClick={submitReview} disabled={submitReviewing || !reviewForm.overall_comment.trim()} className="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold text-sm disabled:bg-gray-300 hover:bg-black">{submitReviewing ? 'Submitting…' : 'Submit Review'}</button>
          </div>
        )}

        {/* My submissions */}
        {view === 'mine' && (
          <div className="space-y-5">
            {loading ? <div className="text-gray-400">Loading…</div> : (
              <>
                {mySubmissions.length === 0 && <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">No submissions yet. Submit an essay to get peer feedback.</div>}
                {mySubmissions.map((s) => {
                  const sReviews = reviewsFor.filter((r) => r.submission_id === s.id);
                  return (
                    <div key={s.id} className="bg-white border border-gray-200 rounded-2xl p-5">
                      <div className="flex items-center justify-between mb-3">
                        <div><div className="font-semibold text-gray-900">{s.exam_type?.toUpperCase()} {s.task_type} · {s.word_count}w</div><div className="text-xs text-gray-400">{fmtDate(s.created_at)} · {s.reviews_count}/{s.reviews_needed} reviews</div></div>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${s.status === 'reviewed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{s.status}</span>
                      </div>
                      {sReviews.length > 0 && (
                        <div className="space-y-3 mt-3 border-t border-gray-100 pt-3">
                          {sReviews.map((r, i) => (
                            <div key={r.id ?? i} className="bg-gray-50 rounded-xl p-3 text-sm">
                              {r.band_score !== null && <div className="font-bold text-gray-900 mb-1">Band: {r.band_score}</div>}
                              {r.strengths && <div className="text-emerald-700 mb-1"><strong>Strengths:</strong> {r.strengths}</div>}
                              {r.improvements && <div className="text-amber-700 mb-1"><strong>Improve:</strong> {r.improvements}</div>}
                              {r.overall_comment && <div className="text-gray-700">{r.overall_comment}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
                {myReviews.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded-2xl p-5">
                    <div className="text-sm font-semibold text-gray-700 mb-3">Reviews I've Given ({myReviews.length})</div>
                    {myReviews.map((r) => (
                      <div key={r.id} className="flex items-center justify-between text-sm py-2 border-b border-gray-100 last:border-0">
                        <span className="text-gray-700">{(r.peer_review_submissions as any)?.exam_type?.toUpperCase()} {(r.peer_review_submissions as any)?.task_type}</span>
                        <div className="flex gap-2"><span className="text-gray-500">{r.band_score !== null ? `Band ${r.band_score}` : 'No score'}</span><span className="text-xs text-gray-400">{fmtDate(r.created_at)}</span></div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

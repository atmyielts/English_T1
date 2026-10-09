import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { loadPeerDraft, savePeerDraft, removePeerDraft } from '../lib/peerReviewDraft';

type Submission = {
  id: string; exam_type: string; task_type: string; prompt_text?: string | null; essay_text?: string;
  word_count: number; status: string; reviews_count: number; reviews_needed: number; created_at: string;
  sharing_consent_at?: string | null; assignment_expires_at?: string | null;
  request_id?: string;
};
type Review = {
  id: string; submission_id?: string; band_score: number | null; strengths?: string | null;
  improvements?: string | null; overall_comment: string | null; created_at: string;
  peer_review_submissions?: { exam_type: string; task_type: string } | null;
};
type Reply = { submission?: Submission; submissions?: Submission[]; reviews?: Review[]; review?: Review; ok?: boolean; privacyReady?: boolean };
type View = 'mine' | 'review' | 'submit';
const emptyReview = { band_score: '', overall_comment: '', strengths: '', improvements: '' };
const input = 'w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-700';
const button = 'rounded-xl px-4 py-2.5 text-sm font-semibold bg-gray-900 text-white hover:bg-black disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-700';
const uuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const validSubmissions = (rows: unknown): rows is Submission[] => Array.isArray(rows) && rows.every(row => row && typeof row === 'object'
  && uuid.test(row.id) && typeof row.exam_type === 'string' && typeof row.task_type === 'string' && typeof row.created_at === 'string');
const validReviews = (rows: unknown): rows is Review[] => Array.isArray(rows) && rows.every(row => row && typeof row === 'object'
  && (row.band_score === null || typeof row.band_score === 'number')
  && ['strengths', 'improvements', 'overall_comment'].every(field => row[field] == null || typeof row[field] === 'string'));
class RequestError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}
async function currentSession() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([supabase.auth.getSession(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new DOMException('Session restore timed out', 'TimeoutError')), 10_000);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}

async function request(action: string, payload: Record<string, unknown>, actor: string): Promise<Reply> {
  // Read the current session for each request so a long review survives token refresh.
  const { data } = await currentSession();
  if (!data.session || data.session.user.id !== actor) throw new Error('Your session changed. Sign in again to continue.');
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/peer-review`, {
    method: 'POST', headers: { Authorization: `Bearer ${data.session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json',
      ...(['submit', 'submit_review', 'set_sharing', 'claim_submission', 'release_submission', 'rate_helpful'].includes(action) ? { 'X-Peer-Review-Client-Version': '2' } : {}) },
    body: JSON.stringify({ action, ...payload }), signal: AbortSignal.timeout(20_000),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || typeof result !== 'object' || Array.isArray(result)) throw new RequestError(result?.error || 'Could not complete this request. Please retry.', response.status);
  return { ...result, privacyReady: response.headers.get('X-Peer-Review-Version') === '2' };
}
const errorText = (error: unknown) => error instanceof Error && error.name !== 'TimeoutError' && error.name !== 'TypeError'
  ? error.message : 'Connection interrupted. Your draft is still here. Please retry.';
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export const PeerReviewPage: React.FC = () => {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [actor, setActor] = useState('');
  const actorRef = useRef('');
  const epochRef = useRef(0);
  const [pendingSubmission, setPendingSubmission] = useState(false);
  const [draftAvailable, setDraftAvailable] = useState(true);
  const [privacyReady, setPrivacyReady] = useState(false);
  const [view, setView] = useState<View>('mine');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [essay, setEssay] = useState('');
  const [prompt, setPrompt] = useState('');
  const [examType, setExamType] = useState('ielts');
  const [taskType, setTaskType] = useState('task2');
  const [consent, setConsent] = useState(false);
  const submissionRequest = useRef<{ fingerprint: string; id: string } | null>(null);
  const [queue, setQueue] = useState<Submission[]>([]);
  const [reviewing, setReviewing] = useState<Submission | null>(null);
  const [reviewForm, setReviewForm] = useState(emptyReview);
  const [pendingReview, setPendingReview] = useState(false);
  const [mySubmissions, setMySubmissions] = useState<Submission[]>([]);
  const [myReviews, setMyReviews] = useState<Review[]>([]);
  const [receivedReviews, setReceivedReviews] = useState<Review[]>([]);

  useEffect(() => {
    let active = true;
    const restore = (id: string) => {
      if (!active || actorRef.current === id) return;
      epochRef.current += 1; actorRef.current = id; setActor(id); busyRef.current = false; setBusy(false);
      setPrivacyReady(false); setView('mine'); setReviewing(null); setReviewForm(emptyReview); setPendingReview(false);
      setQueue([]); setMySubmissions([]); setMyReviews([]); setReceivedReviews([]); setError(''); setNotice('');
      const draft = id ? loadPeerDraft(id) : null;
      setEssay(draft?.essay ?? ''); setPrompt(draft?.prompt ?? ''); setExamType(draft?.examType ?? 'ielts'); setTaskType(draft?.taskType ?? 'task2');
      submissionRequest.current = draft?.request ?? null; setPendingSubmission(Boolean(draft?.request)); setConsent(false);
      setDraftAvailable(true); setReady(Boolean(id));
    };
    const timer = setTimeout(() => { if (active && !actorRef.current) setError('Could not restore your session. Reload this page to retry.'); }, 10_000);
    currentSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      clearTimeout(timer);
      if (sessionError || !data.session) { navigate('/auth?returnTo=/peer-review', { replace: true }); return; }
      restore(data.session.user.id);
    }).catch(() => { if (active) setError('Could not restore your session. Reload this page to retry.'); });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { restore(''); navigate('/auth?returnTo=/peer-review', { replace: true }); }
      else if (session) restore(session.user.id);
    });
    return () => { active = false; clearTimeout(timer); listener.subscription.unsubscribe(); };
  }, [navigate]);

  useEffect(() => {
    if (!actor || !ready) return;
    setDraftAvailable(savePeerDraft(actor, { essay, prompt, examType, taskType, request: submissionRequest.current ?? undefined }));
  }, [actor, ready, essay, prompt, examType, taskType, pendingSubmission]);

  async function scopedRequest(action: string, payload: Record<string, unknown> = {}) {
    const owner = actorRef.current, epoch = epochRef.current;
    const result = await request(action, payload, owner);
    if (owner !== actorRef.current || epoch !== epochRef.current) throw new Error('Your session changed.');
    return result;
  }

  useEffect(() => {
    if (!ready) { setLoading(true); return; }
    if (view === 'submit') { setLoading(false); return; }
    let active = true;
    const loadEpoch = epochRef.current;
    setLoading(true);
    setError('');
    const load = async () => {
      try {
        if (view === 'mine') {
          const [mine, given] = await Promise.all([scopedRequest('my_submissions'), scopedRequest('my_reviews')]);
          if (!validSubmissions(mine.submissions) || !validReviews(mine.reviews) || !validReviews(given.reviews)) throw new Error('Could not load your saved writing. Please retry.');
          if (active && loadEpoch === epochRef.current) {
            setMySubmissions(mine.submissions ?? []);
            setReceivedReviews(mine.reviews ?? []);
            setMyReviews(given.reviews ?? []);
            setPrivacyReady(mine.privacyReady === true && given.privacyReady === true);
          }
        } else {
          const result = await scopedRequest('queue');
          if (!validSubmissions(result.submissions)) throw new Error('Could not load the review queue. Please retry.');
          if (active && loadEpoch === epochRef.current) setQueue(result.submissions ?? []);
        }
      } catch (failure) { if (active && loadEpoch === epochRef.current) setError(errorText(failure)); }
      finally { if (active && loadEpoch === epochRef.current) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [ready, actor, view, reload]);

  useEffect(() => {
    if (!reviewing || !actor) return;
    let active = true;
    const epoch = epochRef.current;
    const checkAccess = async () => {
      if (document.visibilityState !== 'visible') return;
      try { await scopedRequest('get_submission', { submission_id: reviewing.id }); }
      catch (failure) {
        if (!active || epoch !== epochRef.current) return;
        if (failure instanceof RequestError && [403, 404, 409].includes(failure.status)) {
          setReviewing((current) => current ? { ...current, essay_text: undefined, prompt_text: null } : null);
          setError('This essay is no longer available through your reservation. Your feedback draft is still here.');
        }
      }
    };
    const timer = setInterval(() => void checkAccess(), 30_000);
    window.addEventListener('focus', checkAccess); document.addEventListener('visibilitychange', checkAccess);
    return () => { active = false; clearInterval(timer); window.removeEventListener('focus', checkAccess); document.removeEventListener('visibilitychange', checkAccess); };
  }, [actor, reviewing?.id]);

  async function perform(work: () => Promise<void>) {
    if (busyRef.current) return;
    const epoch = epochRef.current;
    busyRef.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); }
    catch (failure) { if (epoch === epochRef.current) setError(errorText(failure)); }
    finally { if (epoch === epochRef.current) { busyRef.current = false; setBusy(false); } }
  }

  const submit = () => perform(async () => {
    const attemptEpoch = epochRef.current;
    const payload = { essay_text: essay, prompt_text: prompt || null, exam_type: examType, task_type: taskType };
    const fingerprint = JSON.stringify(payload);
    if (!consent || !privacyReady) throw new Error('Confirm sharing consent before submitting.');
    if (submissionRequest.current && submissionRequest.current.fingerprint !== fingerprint) throw new Error('Retry the original draft before starting another essay.');
    submissionRequest.current ??= { fingerprint, id: crypto.randomUUID() };
    if (!savePeerDraft(actorRef.current, { essay, prompt, examType, taskType, request: submissionRequest.current })) {
      submissionRequest.current = null; setDraftAvailable(false); throw new Error('Your browser cannot keep a recovery copy. Enable browser storage before submitting, and copy your draft before leaving.');
    }
    setPendingSubmission(true);
    let result: Reply;
    try { result = await scopedRequest('submit', { ...payload, sharing_consent: true, request_id: submissionRequest.current.id }); }
    catch (failure) {
      if (attemptEpoch === epochRef.current && failure instanceof RequestError && [400, 413].includes(failure.status)) { submissionRequest.current = null; setPendingSubmission(false); }
      throw failure;
    }
    if (!result.privacyReady || !result.submission || !uuid.test(result.submission.id) || result.submission.request_id !== submissionRequest.current?.id) throw new Error('Submission was not confirmed. Your draft is still here; please retry.');
    removePeerDraft(actorRef.current); setEssay(''); setPrompt(''); setConsent(false); submissionRequest.current = null; setPendingSubmission(false);
    setNotice('Your essay is shared with the review pool. Feedback depends on reviewer availability.');
    setView('mine'); setReload((value) => value + 1);
  });

  const openReview = (submission: Submission, renew = false) => perform(async () => {
    const result = await scopedRequest('claim_submission', { submission_id: submission.id });
    if (result.submission?.id !== submission.id || typeof result.submission?.essay_text !== 'string') throw new Error('Could not reserve this essay. Refresh the queue and try again.');
    setReviewing(result.submission);
    if (!renew) { setReviewForm(emptyReview); setPendingReview(false); }
    else setNotice('Reservation renewed. Your feedback draft is unchanged.');
  });

  const release = () => perform(async () => {
    if (reviewing && (await scopedRequest('release_submission', { submission_id: reviewing.id })).ok !== true) throw new Error('Release was not confirmed. Please retry.');
    setReviewing(null); setReviewForm(emptyReview); setPendingReview(false); setReload((value) => value + 1);
  });

  const submitReview = () => perform(async () => {
    if (!reviewing) return;
    const attemptEpoch = epochRef.current;
    setPendingReview(true);
    let result: Reply;
    try { result = await scopedRequest('submit_review', {
        submission_id: reviewing.id, ...reviewForm,
        band_score: reviewForm.band_score === '' ? null : Number(reviewForm.band_score),
      });
    } catch (failure) {
      if (attemptEpoch === epochRef.current && failure instanceof RequestError && [400, 413].includes(failure.status)) setPendingReview(false);
      throw failure;
    }
    if (!result.review || !uuid.test(result.review.id)) throw new Error('Review was not confirmed. Your feedback is still here; please retry.');
    setReviewing(null); setReviewForm(emptyReview); setPendingReview(false); setReload((value) => value + 1);
    setNotice('Your feedback has been saved. Thank you for reviewing.');
  });

  const setSharing = (submission: Submission, share: boolean) => perform(async () => {
    const result = await scopedRequest('set_sharing', { submission_id: submission.id, sharing_consent: share });
    if (result.ok !== true) throw new Error('Sharing was not updated. Please retry.');
    setReload((value) => value + 1);
    setNotice(share ? 'Your essay is shared with peer reviewers.' : 'Sharing stopped. New reviewer access has been revoked.');
  });

  return (
    <main className="min-h-screen bg-gray-50 pb-12 text-gray-900">
      <header className="border-b border-gray-200 bg-white px-4 py-6">
        <div className="mx-auto max-w-3xl">
          <button onClick={() => navigate(-1)} className="mb-2 text-sm text-gray-600 underline">Back</button>
          <h1 className="text-2xl font-semibold">Peer writing review</h1>
          <p className="mt-2 text-sm text-gray-600">Exchange thoughtful feedback with other learners. Peer scores are practice opinions, not official exam results.</p>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-6">
        <nav aria-label="Peer review sections" className="mb-6 flex flex-wrap gap-2">
          {([{ key: 'mine', label: 'My submissions' }, { key: 'review', label: 'Review queue' }, { key: 'submit', label: 'Submit essay' }] as const).map((tab) => (
            <button key={tab.key} disabled={busy || (tab.key !== 'mine' && !privacyReady)} aria-current={view === tab.key ? 'page' : undefined}
              onClick={() => { setView(tab.key); setError(''); }}
              className={view === tab.key ? button : 'rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium disabled:opacity-50'}>
              {tab.label}
            </button>
          ))}
        </nav>
        {ready && !loading && !privacyReady && !error && <p role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Privacy controls are being updated. Saved feedback remains available; new submissions and reviews will reopen when the update is ready. <button className="font-semibold underline" onClick={() => setReload((value) => value + 1)}>Check again</button></p>}
        {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          {error}
          {!reviewing && view !== 'submit' && <button disabled={busy} onClick={() => ready ? setReload((value) => value + 1) : window.location.reload()} className="ml-3 font-semibold underline">{ready ? 'Retry loading' : 'Reload page'}</button>}
        </div>}
        {notice && <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">{notice}</p>}
        {view === 'submit' && <form onSubmit={(event) => { event.preventDefault(); void submit(); }} className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5">
          <p role="status" className="text-sm text-gray-600">{draftAvailable ? 'Your draft is kept in this browser tab for up to 24 hours.' : 'Recovery storage is unavailable. Copy your draft before leaving this page.'}</p>
          {pendingSubmission && <p role="status" className="text-sm text-amber-900">A previous save was not confirmed. Retry this same draft before starting another essay.</p>}
          <fieldset disabled={busy || !ready} className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm font-medium">Exam<select className={input} disabled={pendingSubmission} value={examType} onChange={(event) => setExamType(event.target.value)}><option value="ielts">IELTS</option><option value="itep">iTEP</option></select></label>
              <label className="space-y-1 text-sm font-medium">Task<select className={input} disabled={pendingSubmission} value={taskType} onChange={(event) => setTaskType(event.target.value)}><option value="task2">Essay</option><option value="task1">Report / short response</option></select></label>
            </div>
            <label className="block space-y-1 text-sm font-medium">Question (optional)<textarea className={input} readOnly={pendingSubmission} value={prompt} onChange={(event) => setPrompt(event.target.value)} maxLength={2000} rows={2} /></label>
            <label className="block space-y-1 text-sm font-medium">Your essay<textarea className={input + ' leading-relaxed'} readOnly={pendingSubmission} value={essay} onChange={(event) => setEssay(event.target.value)} minLength={100} maxLength={20000} required rows={12} aria-describedby="essay-limits" /></label>
            <p id="essay-limits" className="text-xs text-gray-600">{essay.trim().split(/\s+/).filter(Boolean).length} words · 100–20,000 characters. Remove names, contact details and other private information.</p>
            <label className="flex items-start gap-3 text-sm text-gray-700"><input className="mt-1 h-4 w-4 shrink-0" type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /><span>I agree to share this essay and question with other learners who reserve a review. I can stop sharing later; this cannot undo text they have already seen.</span></label>
            <button className={button + ' w-full'} disabled={!consent || essay.trim().length < 100} type="submit">{busy ? 'Submitting…' : 'Submit for peer review'}</button>
          </fieldset>
        </form>}
        {view === 'review' && !reviewing && <section aria-label="Essays available for review">
          {loading ? <p role="status">Loading review queue…</p> : error ? null : queue.length === 0 ? <p className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-gray-600">No essays available right now. Check back later.</p> :
            <div className="space-y-3">{queue.map((submission) => <article key={submission.id} data-submission-id={submission.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-4">
              <div><h2 className="font-medium">{submission.exam_type.toUpperCase()} · {submission.task_type === 'task1' ? 'Short response' : 'Essay'}</h2><p className="text-sm text-gray-600">{submission.word_count} words · {submission.reviews_count}/{submission.reviews_needed} reviews · {date(submission.created_at)}</p></div>
              <button className={button} disabled={busy} onClick={() => void openReview(submission)}>Reserve review</button>
            </article>)}</div>}
        </section>}
        {view === 'review' && reviewing && <section className="space-y-4" aria-label="Review editor">
          <h2 className="text-lg font-semibold">{reviewing.exam_type.toUpperCase()} writing feedback</h2>
          {pendingReview && <p role="status" className="text-sm text-amber-900">Feedback save was not confirmed. Retry the same feedback or check My submissions for saved reviews.</p>}
          <p className="text-sm text-gray-600">Your reservation lasts one hour. Keep the author’s writing private. If it expires, renew it before submitting.</p>
          <div className="flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={() => void openReview(reviewing, true)}>Renew reservation</button><button className="text-sm font-medium underline disabled:opacity-50" disabled={busy} onClick={() => void release()}>Release and return to queue</button></div>
          {reviewing.prompt_text && <p className="whitespace-pre-wrap break-words rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm">{reviewing.prompt_text}</p>}
          <div className="max-h-96 overflow-y-auto whitespace-pre-wrap break-words rounded-xl border border-gray-200 bg-white p-5 text-sm leading-relaxed">{reviewing.essay_text}</div>
          <form onSubmit={(event) => { event.preventDefault(); void submitReview(); }} className="rounded-2xl border border-gray-200 bg-white p-5">
            <fieldset disabled={busy} className="space-y-4">
              <label className="block space-y-1 text-sm font-medium">Practice score (optional, 0–{reviewing.exam_type === 'itep' ? 6 : 9})<input className={input} type="number" readOnly={pendingReview} min={0} max={reviewing.exam_type === 'itep' ? 6 : 9} step={0.5} value={reviewForm.band_score} onChange={(event) => setReviewForm((form) => ({ ...form, band_score: event.target.value }))} /></label>
              <label className="block space-y-1 text-sm font-medium">Strengths<textarea className={input} readOnly={pendingReview} maxLength={3000} rows={2} value={reviewForm.strengths} onChange={(event) => setReviewForm((form) => ({ ...form, strengths: event.target.value }))} /></label>
              <label className="block space-y-1 text-sm font-medium">Areas to improve<textarea className={input} readOnly={pendingReview} maxLength={3000} rows={2} value={reviewForm.improvements} onChange={(event) => setReviewForm((form) => ({ ...form, improvements: event.target.value }))} /></label>
              <label className="block space-y-1 text-sm font-medium">Overall feedback<textarea className={input} readOnly={pendingReview} maxLength={3000} rows={4} required value={reviewForm.overall_comment} onChange={(event) => setReviewForm((form) => ({ ...form, overall_comment: event.target.value }))} /></label>
              <button className={button + ' w-full'} disabled={!reviewForm.overall_comment.trim()} type="submit">{busy ? 'Saving feedback…' : 'Submit review'}</button>
            </fieldset>
          </form>
        </section>}
        {view === 'mine' && <section aria-label="My writing and feedback" className="space-y-5">
          {!ready ? error ? null : <p role="status">Restoring your session…</p> : loading ? <p role="status">Loading your writing…</p> : error ? null : <>
            {!mySubmissions.length && <p className="rounded-2xl border border-dashed border-gray-300 p-8 text-center text-gray-600">No essays yet. Submit your writing when you are ready to share it.</p>}
            {mySubmissions.map((submission) => <article key={submission.id} data-submission-id={submission.id} className="rounded-2xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold">{submission.exam_type.toUpperCase()} · {submission.word_count} words</h2>
              <p className="mt-1 text-sm text-gray-600">{date(submission.created_at)} · {submission.reviews_count}/{submission.reviews_needed} reviews · {!privacyReady ? 'Sharing status unavailable' : !submission.sharing_consent_at ? 'Private' : submission.status === 'reviewed' ? 'Feedback ready' : 'Shared for review'}</p>
              {privacyReady && <div className="my-3 text-sm text-gray-600"><p>Sharing lets other learners reserve and read your essay and question. Stopping sharing prevents further access, but cannot undo text already seen.</p>
                <button className="mt-2 font-semibold text-gray-900 underline disabled:opacity-50" disabled={busy} onClick={() => void setSharing(submission, !submission.sharing_consent_at)}>{submission.sharing_consent_at ? 'Stop sharing' : 'Share with peer reviewers'}</button>
              </div>}
              {receivedReviews.filter((review) => review.submission_id === submission.id).map((review) => <div key={review.id ?? `${submission.id}:${review.created_at}`} className="mt-3 space-y-2 rounded-xl bg-gray-50 p-4 text-sm">
                {review.band_score !== null && <p className="font-semibold">Peer practice score: {review.band_score}</p>}
                {review.strengths && <p className="whitespace-pre-wrap break-words"><strong>Strengths:</strong> {review.strengths}</p>}
                {review.improvements && <p className="whitespace-pre-wrap break-words"><strong>To improve:</strong> {review.improvements}</p>}
                <p className="whitespace-pre-wrap break-words">{review.overall_comment}</p>
              </div>)}
            </article>)}
            {!!myReviews.length && <div className="rounded-2xl border border-gray-200 bg-white p-5"><h2 className="font-semibold">Feedback I have given</h2>
              {myReviews.map((review) => <div key={review.id} className="mt-3 border-t border-gray-100 pt-3 text-sm">
                <p>{review.peer_review_submissions?.exam_type?.toUpperCase()} · {date(review.created_at)}{review.band_score !== null ? ` · Practice score: ${review.band_score}` : ''}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-gray-600">{review.overall_comment}</p>
              </div>)}
            </div>}
          </>}
        </section>}
      </div>
    </main>
  );
};

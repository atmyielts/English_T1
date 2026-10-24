import React, { useCallback, useEffect, useState } from 'react';
import { edgeBase } from '../../lib/supabase';

// Homework OS inside the Telegram Mini App: open work across centres, file and
// text hand-in, centre switching and the learner's own mistakes, which the
// learner (18+) may send to their Schood English practice per centre (D4).
// Backed by the academy-learning edge function; hidden when hand-in is off.

type Work = {
  type: 'assignment' | 'correction';
  assignment_id: string;
  submission_id: string | null;
  academy_id: string;
  title: string;
  center_name: string;
  due_at: string | null;
};
type Homework = { enabled: boolean; centres: { academy_id: string; name: string }[]; active_academy_id: string | null; work: Work[]; open_mistakes: number };
type Mistake = { id: string; tag: string; excerpt: string | null; correction: string | null; explanation: string | null; status: string; center_name: string };
type Feed = { academy_id: string; center_name: string; status: 'off' | 'granted' | 'revoked'; granted_at: string | null; granted_by_role: 'learner' | 'guardian' | null; copied: number };

const MAX_FILES = 6;
const FILE_LIMIT = 20 * 1024 * 1024;
const TOTAL_LIMIT = 50 * 1024 * 1024;

const post = async <T,>(action: string, initData: string, body: Record<string, unknown> = {}): Promise<T> => {
  const res = await fetch(`${edgeBase}/academy-learning`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, initData, ...body }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(String(payload.error ?? `Request failed (${res.status})`));
  return payload as T;
};

const due = (value: string | null) =>
  value ? new Date(value).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

export const TelegramHomeworkPanel: React.FC<{ initData: string; onSubmitted?: () => void }> = ({ initData, onSubmitted }) => {
  const [homework, setHomework] = useState<Homework | null>(null);
  const [target, setTarget] = useState<Work | null>(null);
  const [answer, setAnswer] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [mistakes, setMistakes] = useState<Mistake[] | null>(null);
  const [feeds, setFeeds] = useState<Feed[] | null>(null);
  const [practiceUrl, setPracticeUrl] = useState('https://english.schood.online/review');
  const [adult, setAdult] = useState(false);
  const [feedBusy, setFeedBusy] = useState('');
  const [feedError, setFeedError] = useState('');

  const load = useCallback(async () => {
    if (!initData) return;
    try {
      setHomework(await post<Homework>('miniapp_homework', initData));
    } catch {
      setHomework(null);
    }
  }, [initData]);

  useEffect(() => { void load(); }, [load]);

  if (!homework?.enabled || homework.centres.length === 0) return null;

  const chooseCentre = async (academyId: string) => {
    await post('miniapp_center', initData, { academy_id: academyId || null }).catch(() => undefined);
    await load();
  };

  const pickFiles = (list: FileList | null) => {
    const next = Array.from(list ?? []).slice(0, MAX_FILES);
    if (next.some((f) => f.size > FILE_LIMIT)) return setMessage({ tone: 'error', text: 'Each file must be under 20 MB.' });
    if (next.reduce((sum, f) => sum + f.size, 0) > TOTAL_LIMIT) return setMessage({ tone: 'error', text: 'All files together must be under 50 MB.' });
    setMessage(null);
    setFiles(next);
  };

  const submit = async () => {
    if (!target) return;
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.set('action', 'miniapp_submit');
      form.set('init_data', initData);
      if (target.type === 'correction' && target.submission_id) form.set('submission_id', target.submission_id);
      else form.set('assignment_id', target.assignment_id);
      if (answer.trim()) form.set('text', answer.trim());
      files.forEach((file) => form.append('files', file, file.name));
      const res = await fetch(`${edgeBase}/academy-learning`, { method: 'POST', body: form });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(String(payload.error ?? `Upload failed (${res.status})`));
      setMessage({ tone: 'ok', text: target.type === 'correction' ? `Correction sent for ${target.title}.` : `Handed in: ${target.title}.` });
      setTarget(null);
      setAnswer('');
      setFiles([]);
      await load();
      onSubmitted?.();
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Your homework was not saved. Try again.' });
    } finally {
      setBusy(false);
    }
  };

  const openMistakes = async () => {
    if (mistakes) return setMistakes(null);
    const [payload, feed] = await Promise.all([
      post<{ mistakes: Mistake[] }>('miniapp_mistakes', initData).catch(() => ({ mistakes: [] })),
      post<{ consents: Feed[]; practice_url: string }>('miniapp_mistake_feed', initData).catch(() => null),
    ]);
    setMistakes(payload.mistakes);
    setFeeds(feed?.consents ?? null);
    if (feed?.practice_url) setPracticeUrl(feed.practice_url);
  };

  const setFeed = async (academyId: string, enabled: boolean) => {
    setFeedBusy(academyId);
    setFeedError('');
    try {
      const out = await post<{ consent: Feed }>('miniapp_mistake_feed_set', initData, { academy_id: academyId, enabled, confirmed_adult: enabled && adult });
      setFeeds((list) => (list ?? []).map((f) => (f.academy_id === academyId ? { ...out.consent, center_name: f.center_name } : f)));
      setAdult(false);
    } catch (e) {
      setFeedError(e instanceof Error ? e.message : 'Your practice setting was not saved. Try again.');
    } finally {
      setFeedBusy('');
    }
  };

  return (
    <section className="rounded-2xl border border-gray-900 bg-white p-4 shadow-[0_2px_0_#111827]">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-black">Homework to hand in</div>
        {homework.centres.length > 1 ? (
          <select
            aria-label="Centre"
            value={homework.active_academy_id ?? ''}
            onChange={(e) => void chooseCentre(e.target.value)}
            className="max-w-[55%] rounded-lg border border-gray-300 bg-white px-2 py-1 text-xs font-semibold"
          >
            <option value="">All centres</option>
            {homework.centres.map((c) => <option key={c.academy_id} value={c.academy_id}>{c.name}</option>)}
          </select>
        ) : null}
      </div>
      {message ? (
        <div className={`mt-3 rounded-xl px-3 py-2 text-sm font-semibold ${message.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{message.text}</div>
      ) : null}
      <div className="mt-3 space-y-2">
        {homework.work.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">No open homework right now.</div>
        ) : homework.work.map((w) => (
          <div key={`${w.type}:${w.submission_id ?? w.assignment_id}`} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-bold">{w.type === 'correction' ? 'Fix: ' : ''}{w.title}</div>
              <div className="text-xs text-gray-500">{w.center_name}{w.due_at ? ` · due ${due(w.due_at)}` : ''}</div>
            </div>
            <button type="button" onClick={() => { setTarget(w); setMessage(null); }} className="shrink-0 rounded-lg bg-gray-950 px-3 py-2 text-xs font-bold text-white">
              {w.type === 'correction' ? 'Send fix' : 'Hand in'}
            </button>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-500">You can also send photos, voice notes or files straight to the bot chat.</p>
      <button type="button" onClick={() => void openMistakes()} className="mt-3 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm font-bold">
        My mistakes{homework.open_mistakes ? ` · ${homework.open_mistakes} to fix` : ''}
      </button>
      {mistakes ? (
        <ul className="mt-3 space-y-2">
          {mistakes.length === 0 ? <li className="text-sm text-gray-500">No mistakes yet. They appear after your teacher checks your homework.</li> : mistakes.map((m) => (
            <li key={m.id} className={`rounded-xl border p-3 text-sm ${m.status === 'open' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'}`}>
              {m.excerpt ? <span className="line-through">{m.excerpt}</span> : null}
              {m.correction ? <span> → <b>{m.correction}</b></span> : null}
              {m.explanation ? <div className="mt-1 text-xs text-gray-600">{m.explanation}</div> : null}
              <div className="mt-1 text-[11px] uppercase tracking-wide text-gray-400">{m.tag.replace(/[._]/g, ' ')} · {m.center_name}{m.status !== 'open' ? ' · fixed' : ''}</div>
            </li>
          ))}
        </ul>
      ) : null}
      {mistakes && feeds?.length ? (
        <div className="mt-3 rounded-xl border border-gray-200 p-3">
          <div className="text-sm font-black">Practise these in Schood English</div>
          <p className="mt-1 text-xs text-gray-600">
            Add your open homework mistakes to your Schood English Today plan and Review. Only the mistake, its correction, the explanation and the
            centre name are copied. Turn it off any time and the copies are deleted.
          </p>
          {feeds.some((f) => f.status !== 'granted') ? (
            <label className="mt-2 flex items-start gap-2 text-xs font-semibold">
              <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5" />
              <span>I am 18 or older. (Under 18? Ask your parent or guardian to turn it on from their parent page.)</span>
            </label>
          ) : null}
          <ul className="mt-2 space-y-2">
            {feeds.map((f) => (
              <li key={f.academy_id} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-bold">{f.center_name}</div>
                  <div className="text-xs text-gray-500">
                    {f.status === 'granted' ? `On${f.granted_by_role === 'guardian' ? ' (by your parent)' : ''} · ${f.copied} in your practice` : 'Off'}
                  </div>
                </div>
                <button
                  type="button"
                  disabled={feedBusy !== '' || (f.status !== 'granted' && !adult)}
                  onClick={() => void setFeed(f.academy_id, f.status !== 'granted')}
                  className={`shrink-0 rounded-lg px-3 py-2 text-xs font-bold disabled:opacity-50 ${f.status === 'granted' ? 'border border-gray-300' : 'bg-gray-950 text-white'}`}
                >
                  {feedBusy === f.academy_id ? 'Saving…' : f.status === 'granted' ? 'Turn off' : 'Turn on'}
                </button>
              </li>
            ))}
          </ul>
          {feedError ? <div className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{feedError}</div> : null}
          {feeds.some((f) => f.status === 'granted') ? (
            <a href={practiceUrl} target="_blank" rel="noreferrer" className="mt-2 block text-center text-xs font-bold underline">Open Schood English Review</a>
          ) : null}
        </div>
      ) : null}

      {target ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 px-3 pb-3">
          <div className="mx-auto max-h-[88vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-wide text-gray-500">{target.type === 'correction' ? 'Send your correction' : 'Hand in'}</div>
                <h2 className="mt-1 text-lg font-black">{target.title}</h2>
                <div className="text-xs text-gray-500">{target.center_name}</div>
              </div>
              <button type="button" onClick={() => setTarget(null)} className="rounded-lg border border-gray-200 px-3 py-1 text-sm font-bold">Close</button>
            </div>
            <textarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              rows={6}
              className="mt-4 w-full rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none focus:border-gray-900"
              placeholder="Write your answer here (optional if you attach files)"
            />
            <label className="mt-3 block rounded-xl border border-dashed border-gray-400 px-3 py-4 text-center text-sm font-semibold text-gray-700">
              {files.length ? `${files.length} file${files.length > 1 ? 's' : ''} selected` : 'Add photos, audio, video or a PDF'}
              <input type="file" multiple accept="image/*,audio/*,video/*,application/pdf" className="sr-only" onChange={(e) => pickFiles(e.target.files)} />
            </label>
            {files.length ? <ul className="mt-2 space-y-1 text-xs text-gray-600">{files.map((f) => <li key={f.name + f.size}>{f.name} · {(f.size / 1024 / 1024).toFixed(1)} MB</li>)}</ul> : null}
            {message?.tone === 'error' ? <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{message.text}</div> : null}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={busy || (!answer.trim() && files.length === 0)}
              className="mt-4 w-full rounded-xl bg-gray-950 px-4 py-3 text-sm font-bold text-white disabled:bg-gray-300"
            >
              {busy ? 'Sending…' : 'Send to teacher'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
};

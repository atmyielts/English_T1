import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const edgeBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
type Card = { id: string; word: string; definition: string; example: string | null; interval: number; repetitions: number };
type Stats = { total: number; due: number; learned: number };

const QUALITY_LABELS = [
  { q: 1, label: 'Again', color: 'bg-red-500 text-white', desc: 'Complete blackout' },
  { q: 3, label: 'Hard', color: 'bg-amber-500 text-white', desc: 'Significant difficulty' },
  { q: 4, label: 'Good', color: 'bg-blue-500 text-white', desc: 'Correct with hesitation' },
  { q: 5, label: 'Easy', color: 'bg-emerald-500 text-white', desc: 'Instant recall' },
];

export const VocabDrillPage: React.FC = () => {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [addText, setAddText] = useState('');
  const [adding, setAdding] = useState(false);

  const loadDue = async (tok: string) => {
    const [dueRes, statsRes] = await Promise.all([
      fetch(`${edgeBase}/vocab-drill?action=due&limit=20`, { headers: { Authorization: `Bearer ${tok}` } }).then((r) => r.json()),
      fetch(`${edgeBase}/vocab-drill?action=stats`, { headers: { Authorization: `Bearer ${tok}` } }).then((r) => r.json()),
    ]);
    setCards(dueRes.cards ?? []);
    setStats(statsRes);
    setIdx(0); setRevealed(false); setSessionDone((dueRes.cards ?? []).length === 0);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { navigate('/auth?returnTo=/vocab-drill', { replace: true }); return; }
      const tok = data.session.access_token;
      setToken(tok);
      loadDue(tok).finally(() => setLoading(false));
    });
  }, [navigate]);

  const review = async (quality: number) => {
    if (!token || idx >= cards.length) return;
    const card = cards[idx];
    await fetch(`${edgeBase}/vocab-drill`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'review', card_id: card.id, quality }) });
    const next = idx + 1;
    if (next >= cards.length) { setSessionDone(true); loadDue(token); }
    else { setIdx(next); setRevealed(false); }
  };

  const parseAndAdd = async () => {
    if (!token || !addText.trim()) return;
    setAdding(true);
    const lines = addText.trim().split('\n').filter(Boolean);
    const words = lines.map((line) => {
      const parts = line.split(/\t|:|-/).map((p) => p.trim());
      return { word: parts[0], definition: parts[1] ?? '', example: parts[2] ?? undefined };
    }).filter((w) => w.word && w.definition);
    if (words.length === 0) { setAdding(false); return; }
    await fetch(`${edgeBase}/vocab-drill`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add_words', words }) });
    setAddText(''); setShowAdd(false); loadDue(token);
    setAdding(false);
  };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Loading…</div></div>;

  const current = cards[idx];

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="bg-white border-b border-gray-200 px-4 py-5">
        <div className="max-w-lg mx-auto flex items-center justify-between">
          <div>
            <button onClick={() => navigate(-1)} className="text-xs text-gray-400 mb-1 block">← Back</button>
            <h1 className="text-xl font-bold text-gray-900">Vocabulary Drill</h1>
            <p className="text-sm text-gray-500">IELTS Academic Word List · Spaced repetition</p>
          </div>
          <button onClick={() => setShowAdd(!showAdd)} className="px-3 py-2 border border-gray-200 rounded-xl text-sm hover:bg-gray-50">+ Add Words</button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-3 gap-3">
            {[{ label: 'Due Today', value: stats.due, color: 'text-red-600 bg-red-50' }, { label: 'Learned', value: stats.learned, color: 'text-emerald-600 bg-emerald-50' }, { label: 'Total', value: stats.total, color: 'text-gray-700 bg-gray-50' }].map((s) => (
              <div key={s.label} className={`rounded-xl p-4 text-center ${s.color}`}>
                <div className="text-2xl font-bold">{s.value}</div>
                <div className="text-xs font-medium mt-0.5 opacity-80">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Add words */}
        {showAdd && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-3">
            <div className="text-sm font-semibold text-gray-700">Add custom words</div>
            <p className="text-xs text-gray-500">One per line: <code>word: definition</code> or <code>word - definition - example</code></p>
            <textarea value={addText} onChange={(e) => setAddText(e.target.value)} rows={6} className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none font-mono" placeholder="sustainable: able to be maintained long-term" />
            <button onClick={parseAndAdd} disabled={adding || !addText.trim()} className="w-full bg-gray-900 text-white py-2.5 rounded-xl text-sm font-semibold disabled:bg-gray-300 hover:bg-black">{adding ? 'Adding…' : 'Add to Deck'}</button>
          </div>
        )}

        {/* Flashcard */}
        {sessionDone ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-200">
            <div className="text-4xl mb-3">🎉</div>
            <div className="text-xl font-bold text-gray-900 mb-2">Session complete!</div>
            <div className="text-sm text-gray-500 mb-6">You've reviewed all cards due today. Come back tomorrow for more.</div>
            <button onClick={() => token && loadDue(token)} className="px-5 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-black">Check for more</button>
          </div>
        ) : current ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            {/* Progress bar */}
            <div className="bg-gray-100 h-1.5"><div className="bg-emerald-500 h-1.5 transition-all" style={{ width: `${(idx / cards.length) * 100}%` }} /></div>
            <div className="p-8 text-center min-h-[280px] flex flex-col items-center justify-center">
              <div className="text-xs text-gray-400 mb-4">{idx + 1} of {cards.length}</div>
              <div className="text-4xl font-bold text-gray-900 mb-4">{current.word}</div>
              {!revealed ? (
                <button onClick={() => setRevealed(true)} className="px-6 py-2.5 border-2 border-gray-300 rounded-xl text-sm font-semibold text-gray-600 hover:border-gray-900 hover:text-gray-900 mt-4">Show Definition</button>
              ) : (
                <div className="space-y-3 w-full max-w-sm">
                  <div className="text-gray-700 text-base">{current.definition}</div>
                  {current.example && <div className="text-sm text-gray-500 italic border-l-2 border-gray-200 pl-3">"{current.example}"</div>}
                </div>
              )}
            </div>
            {revealed && (
              <div className="border-t border-gray-100 px-6 py-4">
                <div className="text-xs text-gray-400 text-center mb-3">How well did you know this?</div>
                <div className="grid grid-cols-4 gap-2">
                  {QUALITY_LABELS.map(({ q, label, color, desc }) => (
                    <button key={q} onClick={() => review(q)} title={desc} className={`py-2.5 rounded-xl text-sm font-semibold ${color} hover:opacity-90`}>{label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};

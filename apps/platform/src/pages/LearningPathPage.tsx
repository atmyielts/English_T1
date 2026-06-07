import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const edgeBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

type Plan = { id: string; exam_type: string; target_band: number; current_band: number | null; weeks: number; status: string; generated_at: string; metadata: Record<string, unknown> };
type Item = { id: string; week: number; day: number | null; skill: string; activity: string; description: string; duration_min: number; completed: boolean; completed_at: string | null };

const SKILL_ICONS: Record<string, string> = { reading: '📖', writing: '✍️', listening: '🎧', speaking: '🎙', vocabulary: '📚', grammar: '🔤' };
const SKILL_COLORS: Record<string, string> = { reading: 'bg-blue-50 border-blue-200 text-blue-800', writing: 'bg-violet-50 border-violet-200 text-violet-800', listening: 'bg-amber-50 border-amber-200 text-amber-800', speaking: 'bg-emerald-50 border-emerald-200 text-emerald-800', vocabulary: 'bg-pink-50 border-pink-200 text-pink-800', grammar: 'bg-gray-50 border-gray-200 text-gray-800' };

export const LearningPathPage: React.FC = () => {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [targetBand, setTargetBand] = useState(7.0);
  const [weeks, setWeeks] = useState(4);
  const [activeWeek, setActiveWeek] = useState(1);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { navigate('/auth?returnTo=/learning-path', { replace: true }); return; }
      const tok = data.session.access_token;
      setToken(tok);
      fetch(`${edgeBase}/learning-path?action=get`, { headers: { Authorization: `Bearer ${tok}` } })
        .then((r) => r.json()).then((d) => { setPlan(d.plan); setItems(d.items ?? []); }).catch(() => null).finally(() => setLoading(false));
    });
  }, [navigate]);

  const generate = async () => {
    if (!token) return;
    setGenerating(true);
    try {
      const res = await fetch(`${edgeBase}/learning-path`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate', target_band: targetBand, weeks }) });
      const d = await res.json();
      setPlan(d.plan); setItems(d.items ?? []); setActiveWeek(1);
    } catch { /* ignore */ }
    setGenerating(false);
  };

  const completeItem = async (itemId: string) => {
    if (!token) return;
    await fetch(`${edgeBase}/learning-path`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'complete_item', item_id: itemId }) });
    setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, completed: true, completed_at: new Date().toISOString() } : i));
  };

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Loading…</div></div>;

  const weekItems = items.filter((i) => i.week === activeWeek);
  const totalItems = items.length;
  const completedItems = items.filter((i) => i.completed).length;
  const pct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="bg-white border-b border-gray-200 px-4 py-5">
        <div className="max-w-3xl mx-auto">
          <button onClick={() => navigate(-1)} className="text-xs text-gray-400 mb-1 block">← Back</button>
          <h1 className="text-xl font-bold text-gray-900">Learning Path</h1>
          <p className="text-sm text-gray-500">AI-generated study plan based on your exam history</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {/* Generate or regenerate */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <div className="text-sm font-semibold text-gray-700 mb-4">{plan ? 'Regenerate Plan' : 'Generate Your Plan'}</div>
          <div className="flex gap-4 flex-wrap items-end">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Target Band Score</label>
              <input type="number" min={4} max={9} step={0.5} value={targetBand} onChange={(e) => setTargetBand(Number(e.target.value))} className="border border-gray-300 rounded-xl px-3 py-2 text-sm w-24 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Duration</label>
              <select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none">
                {[2, 4, 6, 8, 12].map((w) => <option key={w} value={w}>{w} weeks</option>)}
              </select>
            </div>
            <button onClick={generate} disabled={generating} className="px-5 py-2 bg-gray-900 text-white text-sm rounded-xl hover:bg-black disabled:bg-gray-300 font-semibold">
              {generating ? 'Generating…' : plan ? '↺ Regenerate' : 'Generate Plan'}
            </button>
          </div>
          {plan && <p className="text-xs text-gray-400 mt-3">Generated from your exam history. Regenerating replaces the current plan.</p>}
        </div>

        {!plan && !generating && (
          <div className="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl text-gray-400">
            Generate your first learning path to see a personalised study schedule.
          </div>
        )}

        {plan && (
          <>
            {/* Progress */}
            <div className="bg-white rounded-2xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-gray-700">Overall Progress</div>
                <div className="text-sm font-bold text-gray-900">{completedItems}/{totalItems} activities</div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div className="bg-emerald-500 h-3 rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="text-xs text-gray-400 mt-1.5">{pct}% complete · Target band {plan.target_band} · {plan.weeks} weeks</div>
            </div>

            {/* Week tabs */}
            <div className="flex gap-1 overflow-x-auto pb-1">
              {Array.from({ length: plan.weeks }, (_, i) => i + 1).map((w) => {
                const wItems = items.filter((i) => i.week === w);
                const wDone = wItems.filter((i) => i.completed).length;
                return (
                  <button key={w} onClick={() => setActiveWeek(w)} className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors ${activeWeek === w ? 'bg-gray-900 text-white' : 'border border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    Week {w} <span className="text-xs opacity-70">({wDone}/{wItems.length})</span>
                  </button>
                );
              })}
            </div>

            {/* Week activities */}
            <div className="space-y-3">
              {weekItems.length === 0 && <div className="text-gray-400 text-sm text-center py-8">No activities for this week.</div>}
              {weekItems.sort((a, b) => (a.day ?? 0) - (b.day ?? 0)).map((item) => (
                <div key={item.id} className={`border rounded-2xl p-4 ${item.completed ? 'opacity-60 bg-gray-50' : 'bg-white'}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="text-2xl">{SKILL_ICONS[item.skill] ?? '📝'}</div>
                      <div>
                        <div className={`inline-block text-xs px-2 py-0.5 rounded-full border mb-1 ${SKILL_COLORS[item.skill] ?? 'bg-gray-50 border-gray-200 text-gray-700'}`}>{item.skill}</div>
                        <div className="font-medium text-gray-900 text-sm">{item.activity}</div>
                        {item.description && <div className="text-xs text-gray-500 mt-0.5">{item.description}</div>}
                        <div className="text-xs text-gray-400 mt-1">Day {item.day ?? '—'} · {item.duration_min} min</div>
                      </div>
                    </div>
                    {!item.completed ? (
                      <button onClick={() => completeItem(item.id)} className="shrink-0 px-3 py-1.5 border border-gray-200 text-xs rounded-lg hover:bg-gray-50">Mark done</button>
                    ) : (
                      <div className="shrink-0 text-emerald-500 text-sm font-medium">✓ Done</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const edgeBase = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

type Result = { overall_band: number | null; criteria: { FC: number; LR: number; GRA: number; P: number } | null; strengths: string[]; improvements: string[]; feedback: string; word_count: number };
type HistoryItem = { id: string; topic: string | null; task_type: string; overall_band: number | null; word_count: number; created_at: string };

const TOPICS = {
  part1: ['Describe your hometown.', 'Talk about your favourite season.', 'Describe your daily routine.'],
  part2: ['Describe a place you have visited that you found interesting.', 'Describe a person who has influenced you.', 'Describe a book or film that impressed you.'],
  part3: ['How do you think cities will change in the future?', 'What role does technology play in modern education?', 'How has globalisation affected local cultures?'],
};

const bandColor = (b: number | null) => b === null ? '' : b >= 7 ? 'text-emerald-600' : b >= 5.5 ? 'text-amber-600' : 'text-red-600';
const fmtDate = (s: string) => new Date(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export const SpeakingCoachPage: React.FC = () => {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [taskType, setTaskType] = useState<'part1' | 'part2' | 'part3'>('part2');
  const [topic, setTopic] = useState('');
  const [transcript, setTranscript] = useState('');
  const [recording, setRecording] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [speechSupported] = useState(() => 'SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  const recRef = useRef<any>(null);
  const timerRef = useRef<number>(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { navigate('/auth?returnTo=/speaking-coach', { replace: true }); return; }
      setToken(data.session.access_token);
      fetch(`${edgeBase}/speaking-coach?action=history`, { headers: { Authorization: `Bearer ${data.session.access_token}` } })
        .then((r) => r.json()).then((d) => setHistory(d.sessions ?? [])).catch(() => null);
    });
  }, [navigate]);

  const startRecording = () => {
    if (!speechSupported) { setError('Speech recognition requires Chrome or Edge browser.'); return; }
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US';
    let final = '';
    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript + ' ';
        else interim += e.results[i][0].transcript;
      }
      setTranscript(final + interim);
    };
    rec.onerror = () => { setRecording(false); };
    rec.start(); recRef.current = rec; setRecording(true); setResult(null); setError(null);
    setElapsed(0);
    timerRef.current = window.setInterval(() => setElapsed((t) => t + 1), 1000);
  };

  const stopRecording = () => {
    recRef.current?.stop(); recRef.current = null;
    clearInterval(timerRef.current); setRecording(false);
  };

  const score = async () => {
    if (!token || !transcript.trim()) return;
    setScoring(true); setError(null);
    try {
      const res = await fetch(`${edgeBase}/speaking-coach`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'score', transcript: transcript.trim(), topic: topic || null, task_type: taskType, duration_secs: elapsed }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Scoring failed'); return; }
      setResult(data);
      setHistory((h) => [{ id: data.session_id, topic: topic || null, task_type: taskType, overall_band: data.overall_band, word_count: data.word_count, created_at: data.graded_at }, ...h.slice(0, 9)]);
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed'); }
    setScoring(false);
  };

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      <div className="bg-white border-b border-gray-200 px-4 py-5">
        <div className="max-w-3xl mx-auto">
          <button onClick={() => navigate(-1)} className="text-xs text-gray-400 mb-1 block">← Back</button>
          <h1 className="text-xl font-bold text-gray-900">AI Speaking Coach</h1>
          <p className="text-sm text-gray-500">Speak and receive IELTS band score + detailed feedback</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
        {!speechSupported && <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">For best results, use Chrome or Edge — Speech Recognition is required for the microphone button. You can also type or paste a transcript below.</div>}

        {/* Controls */}
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Task Type</label>
            <select value={taskType} onChange={(e) => setTaskType(e.target.value as any)} className="border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none">
              <option value="part1">Part 1 (Introduction)</option>
              <option value="part2">Part 2 (Long turn)</option>
              <option value="part3">Part 3 (Discussion)</option>
              <option value="free">Free Practice</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-semibold text-gray-600 mb-1">Topic / Question</label>
            <div className="flex gap-2">
              <input value={topic} onChange={(e) => setTopic(e.target.value)} className="flex-1 border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none" placeholder="Describe a place you have visited…" />
              <select onChange={(e) => setTopic(e.target.value)} className="border border-gray-300 rounded-xl px-2 py-2 text-xs focus:outline-none" value="">
                <option value="">Sample…</option>
                {TOPICS[taskType]?.map((t, i) => <option key={i} value={t}>{t.slice(0, 50)}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Record button */}
        <div className="flex items-center gap-4">
          {speechSupported && (
            <button
              onClick={recording ? stopRecording : startRecording}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-sm ${recording ? 'bg-red-500 text-white hover:bg-red-600 animate-pulse' : 'bg-gray-900 text-white hover:bg-black'}`}
            >
              {recording ? `⏹ Stop (${fmtTime(elapsed)})` : '🎙 Start Recording'}
            </button>
          )}
          {recording && <div className="text-sm text-red-500 animate-pulse">● Recording…</div>}
        </div>

        {/* Transcript */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">
            Transcript {transcript && <span className="text-gray-400 font-normal">({transcript.split(/\s+/).filter(Boolean).length} words)</span>}
          </label>
          <textarea
            value={transcript} onChange={(e) => setTranscript(e.target.value)} rows={8}
            className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none leading-relaxed"
            placeholder={recording ? 'Transcript will appear here as you speak…' : 'Or type/paste your transcript here for scoring…'}
          />
        </div>

        {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>}

        <button onClick={score} disabled={scoring || !transcript.trim() || recording} className="w-full bg-gray-900 text-white py-3 rounded-xl font-semibold hover:bg-black disabled:bg-gray-300 text-sm">
          {scoring ? 'Scoring…' : 'Get IELTS Band Score'}
        </button>

        {/* Result */}
        {result && (
          <div className="space-y-4">
            <div className="flex items-center gap-6 p-5 bg-gray-50 rounded-2xl border border-gray-200">
              <div className="text-center">
                <div className={`text-5xl font-bold ${bandColor(result.overall_band)}`}>{result.overall_band?.toFixed(1) ?? '—'}</div>
                <div className="text-xs text-gray-500 mt-1 uppercase tracking-wide">Overall Band</div>
              </div>
              {result.criteria && (
                <div className="flex-1">
                  {Object.entries(result.criteria).map(([k, v]) => (
                    <div key={k} className="flex items-center gap-2 mb-1.5">
                      <div className="text-xs font-semibold text-gray-500 w-8">{k}</div>
                      <div className="flex-1 bg-gray-200 rounded-full h-2"><div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${(v / 9) * 100}%` }} /></div>
                      <div className="text-sm font-bold text-gray-800 w-6 text-right">{v}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {result.feedback && <div className="p-4 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 leading-relaxed">{result.feedback}</div>}
            <div className="grid grid-cols-2 gap-4">
              {result.strengths?.length > 0 && <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl"><div className="text-xs font-semibold text-emerald-700 mb-2 uppercase">Strengths</div><ul className="space-y-1">{result.strengths.map((s, i) => <li key={i} className="text-sm text-emerald-800">✓ {s}</li>)}</ul></div>}
              {result.improvements?.length > 0 && <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl"><div className="text-xs font-semibold text-amber-700 mb-2 uppercase">To Improve</div><ul className="space-y-1">{result.improvements.map((s, i) => <li key={i} className="text-sm text-amber-800">→ {s}</li>)}</ul></div>}
            </div>
            <div className="text-xs text-gray-400 text-right">{result.word_count} words spoken</div>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <div className="text-sm font-semibold text-gray-700 mb-3">Recent Sessions</div>
            <div className="space-y-2">
              {history.map((h) => (
                <div key={h.id ?? h.created_at} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-100 last:border-0">
                  <div><span className="font-medium text-gray-800">{h.task_type}</span><span className="text-gray-400 ml-2 truncate">{h.topic?.slice(0, 50)}</span></div>
                  <div className="flex gap-3 shrink-0"><span className={`font-bold ${bandColor(h.overall_band)}`}>{h.overall_band?.toFixed(1) ?? '—'}</span><span className="text-xs text-gray-400">{fmtDate(h.created_at)}</span></div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

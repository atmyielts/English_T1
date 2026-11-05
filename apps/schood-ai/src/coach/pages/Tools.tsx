import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Volume2 } from 'lucide-react';
import { Button, Card, PageHeader, useLocation, useSession, useT } from '../../core/index.ts';
import { coachApi } from '../api.ts';
import { Loaded, useLoad } from '../ui.tsx';
import { SignedOut } from './common.tsx';

// Small Mini App tools the chat cannot do well:
//   /coach/<pack>/timer: the long-turn timer (1 minute to prepare, 2 to talk);
//   /coach/<pack>/listen/<set>: a listening script read aloud by the browser's
//      own voice when no speech provider is set up (two voices for dialogues);
//   /coach/<pack>/shadow/<set>/<sentence>: a model sentence, slow or normal speed;
//   /coach/<pack>/chart/<task>: a Writing Task 1 chart or table.

export function CoachTimer() {
  const t = useT(), { query } = useLocation();
  const prep = Math.min(300, Math.max(5, Number(query.get('prep')) || 60)), talk = Math.min(600, Math.max(10, Number(query.get('talk')) || 120));
  const [phase, setPhase] = useState<'ready' | 'prep' | 'talk' | 'done'>('ready');
  const [left, setLeft] = useState(prep);
  useEffect(() => {
    if (phase !== 'prep' && phase !== 'talk') return;
    const timer = setInterval(() => setLeft((value) => {
      if (value > 1) return value - 1;
      if (phase === 'prep') { setPhase('talk'); try { navigator.vibrate?.(200); } catch { /* optional */ } return talk; }
      setPhase('done'); try { navigator.vibrate?.([200, 100, 200]); } catch { /* optional */ } return 0;
    }), 1000);
    return () => clearInterval(timer);
  }, [phase, talk]);
  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return <div className="flex min-w-0 flex-col gap-4">
    <PageHeader eyebrow={t('coach.eyebrow')} title={t('coach.timer.title')} lead={t('coach.timer.lead')}/>
    <Card className="flex flex-col items-center gap-4 text-center">
      <p className="m-0 text-sm font-semibold uppercase tracking-wider text-gray-600" aria-live="polite">{t(`coach.timer.${phase}`)}</p>
      <p className="m-0 font-display text-6xl font-bold tabular-nums" role="timer" aria-live="off">{phase === 'ready' ? `${Math.floor(prep / 60)}:${String(prep % 60).padStart(2, '0')}` : mm}</p>
      <div className="flex gap-2">
        {phase === 'ready' && <Button onClick={() => { setLeft(prep); setPhase('prep'); }} icon={<Play size={16} aria-hidden="true"/>}>{t('coach.timer.start')}</Button>}
        {phase !== 'ready' && <Button variant="secondary" onClick={() => { setPhase('ready'); setLeft(prep); }} icon={<RotateCcw size={16} aria-hidden="true"/>}>{t('coach.timer.reset')}</Button>}
      </div>
      <p className="m-0 text-xs text-gray-600">{t('coach.timer.note')}</p>
    </Card>
  </div>;
}

function speak(lines: string[], speakers: (string | null)[], rate: number, onEnd: () => void) {
  const synth = window.speechSynthesis;
  if (!synth) return false;
  synth.cancel();
  const voices = synth.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith('en'));
  const names = [...new Set(speakers.filter(Boolean))];
  lines.forEach((line, index) => {
    const utterance = new SpeechSynthesisUtterance(line);
    utterance.lang = 'en-GB';
    utterance.rate = rate;
    const speaker = speakers[index];
    if (voices.length > 1 && speaker) utterance.voice = voices[names.indexOf(speaker) % voices.length] ?? null;
    if (index === lines.length - 1) utterance.onend = onEnd;
    synth.speak(utterance);
  });
  return true;
}

function Player({ lines, speakers, rates }: { lines: string[]; speakers: (string | null)[]; rates: number[] }) {
  const t = useT();
  const [playing, setPlaying] = useState(false);
  const [rate, setRate] = useState(rates[0]);
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const stop = useRef(() => { try { window.speechSynthesis?.cancel(); } catch { /* none */ } });
  useEffect(() => () => stop.current(), []);
  if (!supported) return <p className="m-0 text-sm text-gray-700">{t('coach.listen.unsupported')}</p>;
  return <div className="flex flex-wrap items-center gap-2">
    {!playing ? <Button onClick={() => { if (speak(lines, speakers, rate, () => setPlaying(false))) setPlaying(true); }} icon={<Play size={16} aria-hidden="true"/>}>{t('coach.listen.play')}</Button>
      : <Button variant="secondary" onClick={() => { stop.current(); setPlaying(false); }} icon={<Pause size={16} aria-hidden="true"/>}>{t('coach.listen.stop')}</Button>}
    {rates.length > 1 && rates.map((value) => <Button key={value} size="sm" variant={value === rate ? 'primary' : 'secondary'} onClick={() => setRate(value)} aria-pressed={value === rate}>{value === 1 ? t('coach.listen.normal') : t('coach.listen.slow')}</Button>)}
  </div>;
}

export function CoachListen({ params }: { params: Record<string, string> }) {
  const t = useT(), session = useSession();
  const state = useLoad(() => session.status === 'signed_in' ? coachApi.audioText(params.pack, params.set) : Promise.reject(new Error('signed out')), [params.pack, params.set, session.status]);
  if (session.status !== 'signed_in') return <SignedOut pack={params.pack}/>;
  return <div className="flex min-w-0 flex-col gap-4">
    <PageHeader eyebrow={t('coach.eyebrow')} title={t('coach.listen.title')} lead={t('coach.listen.lead')}/>
    <Card className="flex flex-col gap-3">
      <Loaded state={state}>{(data) => <>
        <p className="m-0 inline-flex items-center gap-2 text-sm text-gray-700"><Volume2 size={16} aria-hidden="true"/>{t('coach.listen.once')}</p>
        <Player lines={data.lines} speakers={data.speakers} rates={[1]}/>
        <p className="m-0 text-xs text-gray-600">{t('coach.listen.back')}</p>
      </>}</Loaded>
    </Card>
  </div>;
}

export function CoachShadow({ params }: { params: Record<string, string> }) {
  const t = useT(), session = useSession();
  const state = useLoad(() => session.status === 'signed_in' ? coachApi.audioText(params.pack, `${params.set}/${params.sentence}`) : Promise.reject(new Error('signed out')), [params.pack, params.set, params.sentence, session.status]);
  if (session.status !== 'signed_in') return <SignedOut pack={params.pack}/>;
  return <div className="flex min-w-0 flex-col gap-4">
    <PageHeader eyebrow={t('coach.eyebrow')} title={t('coach.shadow.title')} lead={t('coach.shadow.lead')}/>
    <Card className="flex flex-col gap-3">
      <Loaded state={state}>{(data) => <>
        <p className="m-0 font-display text-xl font-bold leading-8">{data.lines[0]}</p>
        {data.focus && <p className="m-0 text-sm text-gray-700">{data.focus}</p>}
        <Player lines={data.lines} speakers={data.speakers} rates={[1, 0.75]}/>
        <p className="m-0 text-xs text-gray-600">{t('coach.shadow.back')}</p>
      </>}</Loaded>
    </Card>
  </div>;
}

export function CoachChart({ params }: { params: Record<string, string> }) {
  const session = useSession();
  const state = useLoad(() => session.status === 'signed_in' ? coachApi.chart(params.pack, params.task) : Promise.reject(new Error('signed out')), [params.pack, params.task, session.status]);
  if (session.status !== 'signed_in') return <SignedOut pack={params.pack}/>;
  return <Loaded state={state}>{(data) => {
    const numeric = data.data.rows.every((row) => row.slice(1).every((cell) => typeof cell === 'number'));
    const series = data.data.columns.slice(1);
    const max = numeric ? Math.max(1, ...data.data.rows.flatMap((row) => row.slice(1) as number[])) : 1;
    const colors = ['#0f172a', '#1d4ed8', '#0f766e', '#b45309', '#7c3aed', '#be123c'];
    return <div className="flex min-w-0 flex-col gap-4">
      <PageHeader eyebrow={data.title} title={data.data.title} lead={data.prompt}/>
      <Card className="flex flex-col gap-3">
        {numeric && data.data.kind !== 'table' && data.data.kind !== 'process' && <figure className="m-0">
          <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-label={data.data.title}>
            {data.data.rows.map((row) => <li key={String(row[0])}>
              <p className="m-0 text-sm font-semibold">{String(row[0])}</p>
              {series.map((name, index) => <div key={name} className="mt-1 flex items-center gap-2 text-xs">
                <span className="w-24 shrink-0 truncate text-gray-700">{name}</span>
                <span className="h-3 rounded-full" style={{ width: `${Math.max(2, ((row[index + 1] as number) / max) * 70)}%`, background: colors[index % colors.length] }} aria-hidden="true"/>
                <span className="font-semibold">{String(row[index + 1])}{data.data.unit ? ` ${data.data.unit}` : ''}</span>
              </div>)}
            </li>)}
          </ul>
        </figure>}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{data.data.title}</caption>
            <thead><tr>{data.data.columns.map((column) => <th key={column} scope="col" className="border-b border-navy-line/30 px-2 py-1 text-left">{column}</th>)}</tr></thead>
            <tbody>{data.data.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => cellIndex === 0 ? <th key={cellIndex} scope="row" className="border-b border-navy-line/10 px-2 py-1 text-left font-semibold">{String(cell)}</th> : <td key={cellIndex} className="border-b border-navy-line/10 px-2 py-1">{String(cell)}</td>)}</tr>)}</tbody>
          </table>
        </div>
        <p className="m-0 text-xs text-gray-600">{data.data.note}</p>
      </Card>
    </div>;
  }}</Loaded>;
}

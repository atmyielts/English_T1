import { useEffect, useRef, useState } from 'react';
import { Mic, PenLine, Square, Trash2 } from 'lucide-react';
import { Badge, Button, Card, EmptyState, Eyebrow, Field, TextArea, useI18n } from '../../core/index.ts';
import { useT } from '../i18n/lazy.ts';
import { useAction, useEngage, type SampleView } from '../api.ts';
import { EngageError, Loaded, Notice, Page } from '../ui.tsx';

// /then-vs-now (E7): your day-1 voice next to today's, your first essay next to the
// latest, each with its measured numbers (and the coach's scores when a coach recorded
// it). Samples are private: playback links are signed for you for a few minutes.

interface Pair { first: SampleView; latest: SampleView | null; days_between: number; count: number }
interface ThenNowView { voice: Pair | null; writing: Pair | null; samples: SampleView[] }

const METRICS_VOICE = ['words_per_minute', 'filler_per_100', 'unique_word_share', 'seconds'] as const;
const METRICS_WRITING = ['words', 'words_per_sentence', 'unique_word_share', 'long_word_share'] as const;
// Fewer fillers is better; for the rest, more is better.
const lowerIsBetter = new Set(['filler_per_100']);

function Delta({ metric, first, latest }: { metric: string; first: number | undefined; latest: number | undefined }) {
  if (first === undefined || latest === undefined || metric === 'seconds') return null;
  const change = Math.round((latest - first) * 10) / 10;
  if (!change) return null;
  const better = lowerIsBetter.has(metric) ? change < 0 : change > 0;
  return <span className={`ml-1 text-xs font-semibold ${better ? 'text-green-700' : 'text-gray-500'}`}>{change > 0 ? '+' : ''}{change}</span>;
}

function SampleColumn({ title, sample, metrics, compare }: { title: string; sample: SampleView; metrics: readonly string[]; compare?: SampleView }) {
  const t = useT(), { date } = useI18n();
  return <div className="flex min-w-0 flex-col gap-2 rounded-2xl border border-navy-line/30 bg-white p-3">
    <p className="m-0 text-xs font-semibold uppercase tracking-wider text-gray-600">{title} · {date(sample.recorded_at, { dateStyle: 'medium' })}</p>
    {sample.kind === 'voice' && (sample.url ? <audio controls preload="none" src={sample.url} className="w-full"><track kind="captions"/></audio> : <p className="m-0 text-sm text-gray-600">{t('engage.thenNow.unavailable')}</p>)}
    {sample.kind === 'writing' && sample.text && <p className="m-0 max-h-48 overflow-auto whitespace-pre-wrap text-sm leading-6">{sample.text}</p>}
    <dl className="m-0 grid grid-cols-2 gap-1 text-sm">
      {metrics.filter((metric) => sample.metrics[metric] !== undefined).map((metric) => <div key={metric} className="contents">
        <dt className="text-gray-600">{t(`engage.metric.${metric}`)}</dt>
        <dd className="m-0 font-semibold tabular-nums">{sample.metrics[metric]}{compare && <Delta metric={metric} first={compare.metrics[metric]} latest={sample.metrics[metric]}/>}</dd>
      </div>)}
      {Object.entries(sample.scores).map(([name, score]) => <div key={name} className="contents"><dt className="text-gray-600">{name.replace(/_/g, ' ')}</dt><dd className="m-0 font-semibold">{score}</dd></div>)}
    </dl>
  </div>;
}

function Comparison({ pair, kind }: { pair: Pair; kind: 'voice' | 'writing' }) {
  const t = useT();
  const metrics = kind === 'voice' ? METRICS_VOICE : METRICS_WRITING;
  return <div className="flex flex-col gap-2">
    {pair.latest ? <p className="m-0 text-sm text-gray-700">{t('engage.thenNow.apart', { count: pair.days_between })}</p> : <Notice>{t(kind === 'voice' ? 'engage.thenNow.oneVoice' : 'engage.thenNow.oneWriting')}</Notice>}
    <div className="grid gap-3 md:grid-cols-2">
      <SampleColumn title={t('engage.thenNow.then')} sample={pair.first} metrics={metrics}/>
      {pair.latest && <SampleColumn title={t('engage.thenNow.now')} sample={pair.latest} metrics={metrics} compare={pair.first}/>}
    </div>
  </div>;
}

type Recognition = { start(): void; stop(): void; lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null };
function useRecorder() {
  const [state, setState] = useState<'idle' | 'recording' | 'denied' | 'unsupported'>(typeof MediaRecorder === 'undefined' ? 'unsupported' : 'idle');
  const [seconds, setSeconds] = useState(0);
  const parts = useRef<Blob[]>([]), recorder = useRef<MediaRecorder | null>(null), started = useRef(0), transcript = useRef(''), recognition = useRef<Recognition | null>(null);
  useEffect(() => {
    if (state !== 'recording') return;
    const timer = setInterval(() => setSeconds(Math.round((Date.now() - started.current) / 1000)), 500);
    return () => clearInterval(timer);
  }, [state]);
  const start = async () => {
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      const next = new MediaRecorder(media);
      parts.current = [];
      next.ondataavailable = (event) => { if (event.data.size) parts.current.push(event.data); };
      next.start();
      recorder.current = next;
      started.current = Date.now();
      transcript.current = '';
      setSeconds(0);
      setState('recording');
      // The browser's own speech recognition, when it has one, gives the words for the numbers.
      const Ctor = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
      if (Ctor) {
        const listener = new Ctor();
        listener.lang = 'en-US'; listener.continuous = true; listener.interimResults = false;
        listener.onresult = (event) => { transcript.current = Array.from(event.results).filter((result) => result.isFinal).map((result) => result[0].transcript).join(' '); };
        try { listener.start(); recognition.current = listener; } catch { recognition.current = null; }
      }
    } catch {
      setState('denied');
    }
  };
  const stop = () => new Promise<{ blob: Blob; durationMs: number; transcript: string } | null>((resolve) => {
    const active = recorder.current;
    if (!active) return resolve(null);
    active.onstop = () => {
      active.stream.getTracks().forEach((track) => track.stop());
      try { recognition.current?.stop(); } catch { /* already stopped */ }
      setState('idle');
      resolve({ blob: new Blob(parts.current, { type: active.mimeType || 'audio/webm' }), durationMs: Date.now() - started.current, transcript: transcript.current });
    };
    active.stop();
  });
  return { state, seconds, start, stop };
}

const toBase64 = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

export function ThenNowPage() {
  const t = useT(), { date } = useI18n(), action = useAction();
  const view = useEngage<ThenNowView>('then-now');
  const recorder = useRecorder();
  const [essay, setEssay] = useState('');
  const record = async () => {
    if (recorder.state !== 'recording') return void recorder.start();
    const take = await recorder.stop();
    if (!take || take.durationMs < 3000) return;
    const next = await action.run<ThenNowView>('sample-voice', { audio_base64: await toBase64(take.blob), mime: take.blob.type, duration_ms: Math.min(300_000, take.durationMs), transcript: take.transcript || undefined, prompt_key: 'intro' }, 'voice');
    if (next) view.setData(next);
  };
  const saveEssay = async () => { const next = await action.run<ThenNowView>('sample-writing', { text: essay, prompt_key: 'city' }, 'writing'); if (next) { view.setData(next); setEssay(''); } };
  const remove = async (id: string) => { if (await action.run('sample-delete', { id }, id)) void view.reload(); };
  return <Page eyebrow={<Eyebrow icon={<Mic size={14} aria-hidden="true"/>}>{t('engage.thenNow.eyebrow')}</Eyebrow>} title={t('engage.thenNow.title')} lead={t('engage.thenNow.lead')}>
    <Loaded {...view}>{(data) => <>
      <Card className="flex flex-col gap-4">
        <Eyebrow icon={<Mic size={14} aria-hidden="true"/>}>{t('engage.thenNow.voice')}</Eyebrow>
        <p className="m-0 text-sm text-gray-800">{t('engage.thenNow.voicePrompt')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button variant={recorder.state === 'recording' ? 'danger' : 'primary'} disabled={recorder.state === 'unsupported' || action.busy === 'voice'} onClick={() => void record()}
            icon={recorder.state === 'recording' ? <Square size={16} aria-hidden="true"/> : <Mic size={16} aria-hidden="true"/>}>{recorder.state === 'recording' ? t('engage.thenNow.stop', { seconds: recorder.seconds }) : t('engage.thenNow.record')}</Button>
          {recorder.state === 'denied' && <span role="alert" className="text-sm text-red-700">{t('engage.thenNow.denied')}</span>}
          {recorder.state === 'unsupported' && <span className="text-sm text-gray-600">{t('engage.thenNow.unsupported')}</span>}
        </div>
        <p className="m-0 text-xs text-gray-600">{t('engage.thenNow.private')}</p>
        {data.voice ? <Comparison pair={data.voice} kind="voice"/> : <EmptyState title={t('engage.thenNow.noVoice')} lead={t('engage.thenNow.noVoiceLead')}/>}
      </Card>
      <Card className="flex flex-col gap-4">
        <Eyebrow icon={<PenLine size={14} aria-hidden="true"/>}>{t('engage.thenNow.writing')}</Eyebrow>
        <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void saveEssay(); }}>
          <Field label={t('engage.thenNow.writingPrompt')} hint={t('engage.thenNow.writingHint')}>{(id) => <TextArea id={id} rows={6} maxLength={12000} value={essay} onChange={(event) => setEssay(event.target.value)}/>}</Field>
          <div><Button type="submit" variant="secondary" disabled={action.busy === 'writing' || essay.trim().length < 40}>{t('engage.thenNow.saveWriting')}</Button></div>
        </form>
        {data.writing ? <Comparison pair={data.writing} kind="writing"/> : <EmptyState title={t('engage.thenNow.noWriting')}/>}
      </Card>
      {action.error !== null && <EngageError error={action.error}/>}
      {data.samples.length > 0 && <details className="rounded-3xl border border-navy-line/30 bg-white/70 p-4">
        <summary className="cursor-pointer font-semibold">{t('engage.thenNow.all', { count: data.samples.length })}</summary>
        <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">{data.samples.map((sample) => <li key={sample.id} className="flex flex-wrap items-center gap-2 text-sm">
          <Badge>{t(`engage.thenNow.kind.${sample.kind}`)}</Badge><span className="flex-1">{date(sample.recorded_at, { dateStyle: 'medium' })}</span>
          <Button size="sm" variant="ghost" disabled={action.busy === sample.id} onClick={() => void remove(sample.id)} icon={<Trash2 size={14} aria-hidden="true"/>}>{t('engage.thenNow.delete')}</Button>
        </li>)}</ul>
      </details>}
    </>}</Loaded>
  </Page>;
}

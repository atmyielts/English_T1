import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Mic, ShieldCheck, Square, Timer } from 'lucide-react';
import { attachBrowserSignals } from '../../../../../packages/proctor-web/src/browser.ts';
import { ProctorJournal } from '../../../../../packages/proctor-web/src/journal.ts';
import { ProctorRuntime, type RuntimeTransport } from '../../../../../packages/proctor-web/src/runtime.ts';
import type { BrowserEvent, BrowserEventKind, CandidateProctorState, EventStore, MonitoringStatus } from '../../../../../packages/proctor-web/src/types.ts';
import { Button, Card, Eyebrow, FocusSurface, LoadingState, navigate, TextArea, useWorkspace } from '../../core/index.ts';
import { useT } from '../i18n/lazy.ts';
import { engageCall, useAction, useEngage } from '../api.ts';
import { EngageError, Loaded } from '../ui.tsx';

// /certificates/sitting/:id: the exam itself, in focus mode, monitored by Proctor Lite's
// own client (packages/proctor-web): the runtime polls the candidate state, sends a
// heartbeat and the browser signals (focus, tabs, fullscreen, copy and paste, network)
// to engage's sitting-proctor and sitting-command routes, which speak the proctor
// protocol. Signals are kept on the device in the encrypted journal until sent. They
// are facts for the reviewer, never an automatic finding.

interface Task { id: string; kind: 'speaking' | 'writing'; prompt: string; prepSeconds?: number; speakSeconds?: number; minWords?: number; maxWords?: number; answered: boolean }
interface SittingFull { id: string; exam: string; title: string; status: string; deadline_at: string; items: { id: string; prompt: string; options: { id: string; text: string }[] }[]; tasks: Task[]; answers: Record<string, string>; writing: Record<string, string> }

/** A memory store for browsers without IndexedDB (private windows): signals still go, they just do not survive a reload. */
class MemoryStore implements EventStore {
  private events: BrowserEvent[] = []; private sequence = 0; private stream = crypto.randomUUID();
  append(kind: BrowserEventKind, occurredAt: string) { this.events.push({ stream_id: this.stream, sequence: ++this.sequence, kind, occurred_at: occurredAt }); return Promise.resolve(); }
  pending() { return Promise.resolve([...this.events]); }
  acknowledge(stream: string, sequences: number[]) { this.events = this.events.filter((event) => event.stream_id !== stream || !sequences.includes(event.sequence)); return Promise.resolve(); }
  close() { this.events = []; }
}

function useProctor(sittingId: string, workspaceId: string | null) {
  const [state, setState] = useState<CandidateProctorState | null>(null);
  const [status, setStatus] = useState<MonitoringStatus>({ pending: 0, problem: null });
  const runtime = useRef<ProctorRuntime | null>(null);
  useEffect(() => {
    let closed = false, detach: (() => void) | null = null, timer: ReturnType<typeof setInterval> | null = null;
    const transport: RuntimeTransport = {
      state: () => engageCall<CandidateProctorState>('sitting-proctor', { query: { id: sittingId }, workspaceId }),
      command: (action, data, key) => engageCall('sitting-command', { method: 'POST', body: { action, data }, idempotencyKey: key.replace(/[^A-Za-z0-9_.:-]/g, '').slice(0, 100).padEnd(8, '0'), workspaceId }),
    };
    (async () => {
      const store: EventStore = await ProctorJournal.create(`schood-ai-sitting:${sittingId}`).catch(() => new MemoryStore());
      if (closed) { store.close(); return; }
      const next = new ProctorRuntime(sittingId, store, transport, setState, setStatus);
      runtime.current = next;
      detach = attachBrowserSignals(next);
      void next.tick();
      timer = setInterval(() => void next.tick(), 5000);
    })();
    return () => { closed = true; detach?.(); if (timer) clearInterval(timer); void runtime.current?.close(); };
  }, [sittingId, workspaceId]);
  return { state, status, acknowledge: (id: string) => runtime.current?.acknowledge(id) };
}

function Countdown({ deadline }: { deadline: string }) {
  const t = useT();
  const [left, setLeft] = useState(() => Date.parse(deadline) - Date.now());
  useEffect(() => { const timer = setInterval(() => setLeft(Date.parse(deadline) - Date.now()), 1000); return () => clearInterval(timer); }, [deadline]);
  const seconds = Math.max(0, Math.round(left / 1000));
  return <span role="timer" aria-live="off" className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 font-mono text-sm ${seconds < 300 ? 'border-amber-300 bg-amber-100 text-amber-900' : 'border-white/30'}`}>
    <Timer size={14} aria-hidden="true"/>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}<span className="sr-only">{t('engage.sitting.left')}</span>
  </span>;
}

function SpeakingTask({ task, sittingId, onSaved }: { task: Task; sittingId: string; onSaved: () => void }) {
  const t = useT(), action = useAction();
  const [phase, setPhase] = useState<'idle' | 'prep' | 'recording' | 'saved' | 'denied'>(task.answered ? 'saved' : 'idle');
  const [left, setLeft] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null), chunks = useRef<Blob[]>([]), started = useRef(0);
  useEffect(() => {
    if (phase !== 'prep' && phase !== 'recording') return;
    const timer = setInterval(() => setLeft((value) => value - 1), 1000);
    return () => clearInterval(timer);
  }, [phase]);
  useEffect(() => { if (phase === 'prep' && left <= 0) void record(); if (phase === 'recording' && left <= 0) stop(); }, [left]); // eslint-disable-line react-hooks/exhaustive-deps
  const record = async () => {
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      const next = new MediaRecorder(media);
      chunks.current = [];
      next.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      next.onstop = async () => {
        media.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks.current, { type: next.mimeType || 'audio/webm' });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        const saved = await action.run('sitting-audio', { sitting: sittingId, task: task.id, audio_base64: btoa(binary), mime: blob.type, duration_ms: Math.max(2000, Date.now() - started.current) }, task.id);
        setPhase(saved ? 'saved' : 'idle');
        if (saved) onSaved();
      };
      next.start();
      recorder.current = next;
      started.current = Date.now();
      setLeft(task.speakSeconds ?? 60);
      setPhase('recording');
    } catch {
      setPhase('denied');
    }
  };
  const stop = () => { if (recorder.current?.state === 'recording') recorder.current.stop(); };
  return <Card className="flex flex-col gap-3 bg-white text-gray-900">
    <p className="m-0 font-semibold">{task.prompt}</p>
    <p className="m-0 text-sm text-gray-600">{t('engage.sitting.speakRule', { prep: task.prepSeconds ?? 0, speak: task.speakSeconds ?? 60 })}</p>
    {phase === 'idle' && <div><Button size="sm" onClick={() => { setLeft(task.prepSeconds ?? 0); setPhase('prep'); }} icon={<Mic size={14} aria-hidden="true"/>}>{t('engage.sitting.prepare')}</Button></div>}
    {phase === 'prep' && <p role="status" className="m-0 font-semibold">{t('engage.sitting.prepLeft', { seconds: Math.max(0, left) })}</p>}
    {phase === 'recording' && <div className="flex flex-wrap items-center gap-3"><span role="status" className="font-semibold text-red-700">{t('engage.sitting.recording', { seconds: Math.max(0, left) })}</span><Button size="sm" variant="danger" onClick={stop} icon={<Square size={14} aria-hidden="true"/>}>{t('engage.sitting.finish')}</Button></div>}
    {phase === 'saved' && <p className="m-0 text-sm font-semibold text-green-700">{t('engage.sitting.saved')}</p>}
    {phase === 'denied' && <p role="alert" className="m-0 text-sm text-red-700">{t('engage.thenNow.denied')}</p>}
    {action.error !== null && <EngageError error={action.error}/>}
  </Card>;
}

function Exam({ sitting }: { sitting: SittingFull }) {
  const t = useT(), { workspaceId } = useWorkspace(), action = useAction();
  const proctor = useProctor(sitting.id, workspaceId);
  const [answers, setAnswers] = useState(sitting.answers);
  const [writing, setWriting] = useState(sitting.writing);
  const [, setSaved] = useState(0);
  const pendingWriting = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveAnswers = (next: Record<string, string>) => { setAnswers(next); void action.run('sitting-answers', { sitting: sitting.id, answers: next }, 'answers'); };
  const saveWriting = (id: string, value: string) => {
    const next = { ...writing, [id]: value };
    setWriting(next);
    if (pendingWriting.current) clearTimeout(pendingWriting.current);
    pendingWriting.current = setTimeout(() => void action.run('sitting-answers', { sitting: sitting.id, writing: next }, 'writing'), 1200);
  };
  const submit = async () => {
    if (pendingWriting.current) clearTimeout(pendingWriting.current);
    await action.run('sitting-answers', { sitting: sitting.id, answers, writing }, 'answers');
    if (await action.run('sitting-submit', { sitting: sitting.id }, 'submit')) navigate('/certificates');
  };
  const notices = proctor.state?.notices.filter((notice) => !notice.acknowledged) ?? [];
  const words = (value: string) => (value.match(/[\p{L}\p{N}’'-]+/gu) ?? []).length;
  return <FocusSurface className="flex flex-col gap-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <Eyebrow icon={<ShieldCheck size={14} aria-hidden="true"/>}><span className="text-white/80">{t('engage.sitting.monitored')}</span></Eyebrow>
        <h1 className="m-0 mt-1 font-display text-2xl font-bold">{sitting.title}</h1>
      </div>
      <Countdown deadline={sitting.deadline_at}/>
    </div>
    {proctor.status.problem && <p role="alert" className="m-0 rounded-2xl bg-amber-100 p-3 text-sm text-amber-900">{t('engage.sitting.monitorProblem')}</p>}
    {notices.map((notice) => <div key={notice.id} role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl bg-amber-100 p-3 text-sm text-amber-900">
      <AlertTriangle size={16} aria-hidden="true"/><span className="flex-1">{t('engage.sitting.warning')}</span>
      <Button size="sm" variant="secondary" onClick={() => void proctor.acknowledge(notice.id)}>{t('engage.sitting.understood')}</Button>
    </div>)}
    <section aria-labelledby="engage-items" className="flex flex-col gap-3">
      <h2 id="engage-items" className="m-0 font-display text-lg font-bold">{t('engage.sitting.part1', { count: sitting.items.length })}</h2>
      {sitting.items.map((item, index) => <fieldset key={item.id} className="m-0 flex flex-col gap-2 rounded-2xl bg-white p-4 text-gray-900">
        <legend className="sr-only">{t('engage.sitting.question', { index: index + 1 })}</legend>
        <p className="m-0 text-sm font-semibold">{index + 1}. {item.prompt}</p>
        {item.options.map((option) => <label key={option.id} className="flex items-start gap-2 text-sm"><input type="radio" name={`item-${item.id}`} checked={answers[item.id] === option.id} onChange={() => saveAnswers({ ...answers, [item.id]: option.id })} className="mt-1"/><span>{option.text}</span></label>)}
      </fieldset>)}
    </section>
    <section aria-labelledby="engage-tasks" className="flex flex-col gap-3">
      <h2 id="engage-tasks" className="m-0 font-display text-lg font-bold">{t('engage.sitting.part2')}</h2>
      {sitting.tasks.map((task) => task.kind === 'speaking' ? <SpeakingTask key={task.id} task={task} sittingId={sitting.id} onSaved={() => setSaved((value) => value + 1)}/>
        : <Card key={task.id} className="flex flex-col gap-2 bg-white text-gray-900">
          <label htmlFor={`task-${task.id}`} className="font-semibold">{task.prompt}</label>
          <TextArea id={`task-${task.id}`} rows={8} value={writing[task.id] ?? ''} onChange={(event) => saveWriting(task.id, event.target.value)} onPaste={(event) => event.preventDefault()}/>
          <p className="m-0 text-xs text-gray-600">{t('engage.sitting.words', { count: words(writing[task.id] ?? ''), min: task.minWords ?? 0, max: task.maxWords ?? 0 })}</p>
        </Card>)}
    </section>
    {action.error !== null && <EngageError error={action.error}/>}
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="onDark" disabled={action.busy === 'submit'} onClick={() => void submit()}>{t('engage.sitting.submit')}</Button>
      <span className="text-xs text-white/70">{t('engage.sitting.pending', { count: proctor.status.pending })}</span>
    </div>
  </FocusSurface>;
}

export function SittingPage({ params }: { params: Record<string, string> }) {
  const t = useT();
  const view = useEngage<{ sitting: SittingFull }>('sitting', { id: params.id });
  if (view.loading && !view.data) return <LoadingState/>;
  return <Loaded {...view}>{({ sitting }) => sitting.status === 'started' ? <Exam sitting={sitting}/>
    : <Card className="flex flex-col gap-3"><p className="m-0 font-semibold">{t('engage.sitting.closed')}</p><div><Button size="sm" onClick={() => navigate('/certificates')}>{t('engage.nav.certificates')}</Button></div></Card>}</Loaded>;
}

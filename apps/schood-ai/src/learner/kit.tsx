import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, Keyboard, Mic, Square, Volume2, XCircle } from 'lucide-react';
import { api, ApiError, ApiErrorState, Badge, Button, Card, CreditCost, ErrorState, Eyebrow, LoadingState, PageHeader, SparkMark, TextArea, useT, useWorkspace, type ApiOptions } from '../core/index.ts';

// Shared pieces of the learner screens: calls in this workspace, the under-18
// consent step, speech input (the provider's speech-to-text when the owner set it
// up, else the browser's Web Speech API, always with typing), timers, and
// multiple-choice questions.

/** A JSON call to learner/<action> in the current workspace. */
export function useLearnerApi() {
  const { workspaceId } = useWorkspace();
  return useCallback(<T,>(action: string, options: Omit<ApiOptions, 'workspaceId'> = {}) => api<T>(`learner/${action}`, { ...options, workspaceId, timeoutMs: options.timeoutMs ?? 90_000 }), [workspaceId]);
}

/** Runs one call at a time, keeping its result or error for the screen. */
export function useRun<T>() {
  const [state, setState] = useState<{ busy: boolean; error: unknown; data: T | null }>({ busy: false, error: null, data: null });
  const run = useCallback(async (work: () => Promise<T>) => {
    setState((current) => ({ ...current, busy: true, error: null }));
    try {
      const data = await work();
      setState({ busy: false, error: null, data });
      return data;
    } catch (error) {
      setState((current) => ({ ...current, busy: false, error }));
      return null;
    }
  }, []);
  const set = useCallback((data: T | null) => setState({ busy: false, error: null, data }), []);
  return { ...state, run, set };
}

/** Loads once (and again when the workspace or `key` changes). */
export function useLoad<T>(load: () => Promise<T>, key = '') {
  const { workspaceId } = useWorkspace();
  const [state, setState] = useState<{ data: T | null; error: unknown; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    load().then((data) => { if (live) setState({ data, error: null, loading: false }); }).catch((error) => { if (live) setState({ data: null, error, loading: false }); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId, key, tick]);
  return { ...state, reload: () => setTick((value) => value + 1), setData: (data: T) => setState({ data, error: null, loading: false }) };
}

export function ToolHeader({ title, lead, creditKey, addOns }: { title: ReactNode; lead?: ReactNode; creditKey?: string; addOns?: string[] }) {
  const t = useT();
  return <PageHeader eyebrow={<Eyebrow icon={<SparkMark size={18}/>}>{t('learner.eyebrow')}</Eyebrow>} title={title} lead={lead} actions={creditKey ? <CreditCost creditKey={creditKey} addOns={addOns}/> : undefined}/>;
}

/** Errors from the function as proper states: the learner area's own codes first, then core's. */
export function Failure({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT();
  if (!error) return null;
  if (error instanceof ApiError) {
    const key = `learner.error.${error.code}`, text = t(key);
    if (text !== key) return <div className="mt-4"><ErrorState title={t('learner.error.title')} lead={text} onRetry={onRetry}/></div>;
  }
  return <div className="mt-4"><ApiErrorState error={error} onRetry={onRetry}/></div>;
}

// --- Under-18 consent -----------------------------------------------------------------
interface ConsentView { state: 'ok' | 'required' | 'guardian_required' | 'parent_link_required'; age_band: string | null; linked_parent: boolean }

/** Shows the consent step until it is done; the function enforces the same rule. */
export function ConsentGate({ children }: { children: ReactNode }) {
  const call = useLearnerApi();
  const consent = useLoad(() => call<{ consent: ConsentView }>('consent').then((out) => out.consent));
  if (consent.loading && !consent.data) return <LoadingState/>;
  if (consent.error) return <ApiErrorState error={consent.error} onRetry={consent.reload}/>;
  if (consent.data?.state === 'ok') return <>{children}</>;
  return <ConsentStep current={consent.data} onDone={(view) => consent.setData(view)}/>;
}

export function ConsentStep({ current, onDone }: { current: ConsentView | null; onDone(view: ConsentView): void }) {
  const t = useT(), call = useLearnerApi(), id = useId();
  const [band, setBand] = useState<string>(current?.age_band ?? '');
  const [guardian, setGuardian] = useState(false), [accept, setAccept] = useState(false);
  const save = useRun<ConsentView>();
  const submit = () => save.run(() => call<{ consent: ConsentView }>('consent', { method: 'POST', body: { age_band: band, guardian_confirmed: guardian, accept: true } }).then((out) => { onDone(out.consent); return out.consent; }));
  const bands = [['adult', 'learner.consent.adult'], ['13_17', 'learner.consent.teen'], ['under_13', 'learner.consent.child']] as const;
  const blocked = save.data?.state === 'parent_link_required' || current?.state === 'parent_link_required';
  return <Card className="mx-auto max-w-2xl">
    <h1 className="m-0 font-display text-2xl font-bold">{t('learner.consent.title')}</h1>
    <p className="mb-0 mt-2 text-sm leading-6 text-gray-700">{t('learner.consent.lead')}</p>
    <fieldset className="mt-5 grid gap-2 border-0 p-0">
      <legend className="mb-2 text-sm font-semibold text-gray-900">{t('learner.consent.age')}</legend>
      {bands.map(([value, label]) => <label key={value} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-navy-line/40 bg-white px-3 py-2 text-sm">
        <input type="radio" name={`${id}-band`} value={value} checked={band === value} onChange={() => setBand(value)}/>{t(label)}
      </label>)}
    </fieldset>
    {band === '13_17' && <label className="mt-4 flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1" checked={guardian} onChange={(event) => setGuardian(event.target.checked)}/>{t('learner.consent.guardian')}</label>}
    {band === 'under_13' && <p className="mt-4 rounded-2xl bg-cream-soft p-3 text-sm leading-6 text-gray-800">{t('learner.consent.childNote')}</p>}
    <div className="mt-4 rounded-2xl border border-navy-line/30 bg-white/70 p-3 text-sm leading-6 text-gray-700">
      <p className="m-0 font-semibold text-gray-900">{t('learner.consent.termsTitle')}</p>
      <ul className="mb-0 mt-1 pl-5">{['learner.consent.term1', 'learner.consent.term2', 'learner.consent.term3', 'learner.consent.term4'].map((key) => <li key={key}>{t(key)}</li>)}</ul>
    </div>
    <label className="mt-4 flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1" checked={accept} onChange={(event) => setAccept(event.target.checked)}/>{t('learner.consent.accept')}</label>
    {blocked && <p role="alert" className="mt-3 text-sm font-semibold text-amber-800">{t('learner.consent.needParent')}</p>}
    {save.data?.state === 'guardian_required' && <p role="alert" className="mt-3 text-sm font-semibold text-amber-800">{t('learner.consent.needGuardian')}</p>}
    <div className="mt-5 flex flex-wrap gap-2">
      <Button onClick={() => void submit()} disabled={!band || !accept || save.busy}>{t('learner.consent.continue')}</Button>
    </div>
    <Failure error={save.error}/>
  </Card>;
}

// --- Speech ------------------------------------------------------------------------------
export interface Spoken { text: string; mode: 'speech' | 'typed'; seconds: number | null; audio?: { data: string; mime: string } }
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
const RecognitionCtor = (): (new () => Recognition) | null => {
  const host = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
};
export const browserSpeech = () => !!RecognitionCtor();
export const canRecord = () => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1] ?? ''); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });

/** Speak, or type. `server` sends the recording to the provider's speech-to-text. */
export function SpeechInput({ server, onDone, disabled, maxSeconds = 180, label }: { server: boolean; onDone(spoken: Spoken): void; disabled?: boolean; maxSeconds?: number; label?: string }) {
  const t = useT();
  const voice = server ? canRecord() : browserSpeech();
  const [mode, setMode] = useState<'idle' | 'recording' | 'typing'>(voice ? 'idle' : 'typing');
  const [heard, setHeard] = useState(''), [typed, setTyped] = useState(''), [elapsed, setElapsed] = useState(0);
  const started = useRef(0), recognition = useRef<Recognition | null>(null), recorder = useRef<MediaRecorder | null>(null), timer = useRef<number | null>(null), finalText = useRef('');
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); recognition.current?.stop(); recorder.current?.stop(); }, []);
  const tick = () => { started.current = Date.now(); setElapsed(0); timer.current = window.setInterval(() => { const seconds = Math.round((Date.now() - started.current) / 1000); setElapsed(seconds); if (seconds >= maxSeconds) stop(); }, 500); };
  const seconds = () => Math.max(1, Math.round((Date.now() - started.current) / 1000));
  async function start() {
    setHeard(''); finalText.current = '';
    if (server) {
      try {
        const media = await navigator.mediaDevices.getUserMedia({ audio: true });
        const chunks: Blob[] = [];
        const rec = new MediaRecorder(media);
        rec.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
        rec.onstop = async () => {
          media.getTracks().forEach((track) => track.stop());
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
          onDone({ text: '', mode: 'speech', seconds: seconds(), audio: { data: await toBase64(blob), mime: (rec.mimeType || 'audio/webm').split(';')[0] } });
        };
        recorder.current = rec; rec.start(); setMode('recording'); tick();
      } catch { setMode('typing'); }
      return;
    }
    const Ctor = RecognitionCtor();
    if (!Ctor) { setMode('typing'); return; }
    const rec = new Ctor();
    rec.lang = 'en-US'; rec.interimResults = true; rec.continuous = true;
    rec.onresult = (event) => {
      let interim = '', done = '';
      for (const result of Array.from(event.results)) (result.isFinal ? (done += `${result[0].transcript} `) : (interim += result[0].transcript));
      finalText.current = done.trim();
      setHeard(`${done}${interim}`.trim());
    };
    rec.onerror = () => { setMode('typing'); };
    rec.onend = () => { if (timer.current) { clearInterval(timer.current); timer.current = null; } };
    recognition.current = rec; rec.start(); setMode('recording'); tick();
  }
  function stop() {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    if (recorder.current) { recorder.current.stop(); recorder.current = null; setMode('idle'); return; }
    if (recognition.current) {
      const rec = recognition.current; recognition.current = null;
      rec.stop();
      const text = (finalText.current || heard).trim();
      setMode('idle');
      if (text) onDone({ text, mode: 'speech', seconds: seconds() });
    }
  }
  const sendTyped = () => { if (typed.trim()) { onDone({ text: typed.trim(), mode: 'typed', seconds: null }); setTyped(''); } };
  if (mode === 'typing') return <div className="grid gap-2">
    <label className="text-sm font-semibold text-gray-800" htmlFor="speech-typed">{label ?? t('learner.speech.typeLabel')}</label>
    <TextArea id="speech-typed" rows={3} value={typed} disabled={disabled} onChange={(event) => setTyped(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendTyped(); } }}/>
    <div className="flex flex-wrap gap-2">
      <Button onClick={sendTyped} disabled={disabled || !typed.trim()}>{t('learner.speech.send')}</Button>
      {voice && <Button variant="secondary" onClick={() => setMode('idle')} icon={<Mic size={16} aria-hidden="true"/>}>{t('learner.speech.useVoice')}</Button>}
    </div>
  </div>;
  return <div className="grid gap-3">
    <div className="flex flex-wrap items-center gap-2">
      {mode === 'recording'
        ? <Button variant="danger" onClick={stop} icon={<Square size={16} aria-hidden="true"/>}>{t('learner.speech.stop', { seconds: elapsed })}</Button>
        : <Button variant="spark" onClick={() => void start()} disabled={disabled} icon={<Mic size={16} aria-hidden="true"/>}>{t('learner.speech.start')}</Button>}
      <Button variant="ghost" onClick={() => { stop(); setMode('typing'); }} icon={<Keyboard size={16} aria-hidden="true"/>}>{t('learner.speech.type')}</Button>
      <Badge tone="neutral">{server ? t('learner.speech.server') : t('learner.speech.browser')}</Badge>
    </div>
    {mode === 'recording' && <p aria-live="polite" className="m-0 min-h-6 rounded-2xl bg-white/80 p-3 text-sm text-gray-800">{heard || t('learner.speech.listening')}</p>}
  </div>;
}

/** Reads English aloud: the provider's audio when sent, otherwise the browser voice. */
export function speakAloud(text: string, audio?: { audio: string; mime: string } | null) {
  if (audio) { void new Audio(`data:${audio.mime};base64,${audio.audio}`).play().catch(() => undefined); return; }
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-GB';
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}
export function ListenButton({ text }: { text: string }) {
  const t = useT();
  if (!('speechSynthesis' in window)) return null;
  return <Button variant="ghost" size="sm" onClick={() => speakAloud(text)} icon={<Volume2 size={14} aria-hidden="true"/>}>{t('learner.speech.listen')}</Button>;
}

/** A countdown that calls onEnd once. */
export function Countdown({ seconds, running, onEnd, label }: { seconds: number; running: boolean; onEnd?(): void; label: string }) {
  const [left, setLeft] = useState(seconds);
  const ended = useRef(false);
  useEffect(() => { setLeft(seconds); ended.current = false; }, [seconds]);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);
  useEffect(() => { if (left === 0 && running && !ended.current) { ended.current = true; onEnd?.(); } }, [left, running, onEnd]);
  const minutes = Math.floor(left / 60), rest = String(left % 60).padStart(2, '0');
  return <span role="timer" aria-label={label} className={`inline-flex min-w-16 justify-center rounded-full border border-navy-line px-3 py-1 font-display text-lg font-bold ${left <= 10 && running ? 'bg-amber-100' : 'bg-white'}`}>{minutes}:{rest}</span>;
}

// --- Multiple choice ------------------------------------------------------------------------
export interface McqResult { choice: number; correct: boolean; answer_index: number | null; explanation?: string | null }
export function Mcq({ index, prompt, options, result, onAnswer, disabled }: { index: number; prompt: string; options: string[]; result?: McqResult | null; onAnswer(choice: number): void; disabled?: boolean }) {
  const t = useT(), id = useId();
  return <fieldset className="m-0 grid gap-2 rounded-2xl border border-navy-line/30 bg-white/80 p-4">
    <legend className="px-1 text-sm font-semibold text-gray-900">{t('learner.mcq.question', { n: index + 1 })}</legend>
    <p className="m-0 text-sm leading-6 text-gray-900">{prompt}</p>
    <div className="grid gap-2" role="radiogroup" aria-labelledby={`${id}-q`}>
      {options.map((option, choice) => {
        const picked = result?.choice === choice, right = result && result.answer_index === choice;
        const tone = !result ? 'bg-white hover:bg-cream-soft' : right ? 'border-green-600 bg-green-50' : picked ? 'border-red-400 bg-red-50' : 'bg-white opacity-80';
        return <button key={choice} type="button" disabled={!!result || disabled} onClick={() => onAnswer(choice)} aria-pressed={picked}
          className={`flex min-h-11 items-center justify-between gap-2 rounded-xl border border-navy-line/40 px-3 py-2 text-left text-sm ${tone} focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy`}>
          <span>{option}</span>
          {result && right && <CheckCircle2 size={16} className="text-green-700" aria-label={t('learner.mcq.correct')}/>}
          {result && picked && !right && <XCircle size={16} className="text-red-600" aria-label={t('learner.mcq.wrong')}/>}
        </button>;
      })}
    </div>
    {result && <p role="status" className="m-0 text-sm text-gray-700"><strong>{result.correct ? t('learner.mcq.correct') : t('learner.mcq.wrong')}</strong>{result.explanation ? ` ${result.explanation}` : ''}</p>}
  </fieldset>;
}

export function Section({ title, children, className = '' }: { title: ReactNode; children: ReactNode; className?: string }) {
  return <Card className={`grid gap-3 ${className}`}><h2 className="m-0 font-display text-lg font-bold">{title}</h2>{children}</Card>;
}
export const Quote = ({ children }: { children: ReactNode }) => <q className="rounded bg-lime-soft px-1 text-gray-950">{children}</q>;
/** A link to another Schood site, opened in a new tab. */
export const OutLink = ({ href, children }: { href: string; children: ReactNode }) => <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-gray-900 underline underline-offset-2">{children}</a>;
/** Options for a <select>. */
export const options = (t: (key: string) => string, values: readonly string[], prefix: string) => values.map((value) => <option key={value} value={value}>{t(`${prefix}.${value}`)}</option>);

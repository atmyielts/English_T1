import { useState } from 'react';
import { Award, BadgeCheck, ClipboardCheck, GraduationCap, ShieldCheck, Timer } from 'lucide-react';
import { Badge, Button, Card, Dialog, EmptyState, Eyebrow, Field, Link, navigate, TextInput, useI18n, useWorkspace } from '../../core/index.ts';
import { useT } from '../i18n/lazy.ts';
import { useAction, useEngage } from '../api.ts';
import { QrCode } from '../qr.tsx';
import { EngageError, Loaded, Notice, Page, selectClass } from '../ui.tsx';

// /certificates (E12): Skill Certificate exams per coach level, proctored with Proctor
// Lite and checked by a reviewer, then verifiable by QR. A sitting is bought on its
// own (the plans page, once pricing opens it); beta testers sit test exams.
// /certificates/review is the reviewer's queue for Schood admins.

interface Exam { key: string; title: string; lead: string; level: string; coach: string; minutes: number; items: number; tasks: { id: string; kind: string }[]; pass: { itemsRatio: number; rubricRatio: number; minEach: number }; rubric: { id: string; title: string; max: number }[] }
interface Sitting { id: string; exam: string; title: string; status: string; started_at: string; deadline_at: string; submitted_at: string | null; auto_score: number | null; auto_total: number | null; decided_at: string | null; test: boolean }
interface Certificate { id: string; exam: string; title: string; level: string; score: number; code: string; issued_at: string; revoked: boolean; test: boolean; verify_url: string }
interface CertificatesView { exams: Exam[]; sittings: Sitting[]; certificates: Certificate[]; available: { sittings: number; exams: string[]; beta: boolean; for_sale: boolean } }

function StartDialog({ exam, onClose }: { exam: Exam; onClose: () => void }) {
  const t = useT(), action = useAction(), { me } = useWorkspace();
  const [name, setName] = useState(me?.user.name ?? '');
  const [consent, setConsent] = useState(false);
  const start = async () => {
    const result = await action.run<{ sitting: { id: string } }>('sitting-start', { exam: exam.key, consent, display_name: name.trim() });
    if (result) navigate(`/certificates/sitting/${result.sitting.id}`);
  };
  return <Dialog open title={exam.title} onClose={onClose} closeLabel={t('engage.close')}>
    <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void start(); }}>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm text-gray-800">
        <li>{t('engage.cert.rule.time', { minutes: exam.minutes })}</li>
        <li>{t('engage.cert.rule.page')}</li>
        <li>{t('engage.cert.rule.signals')}</li>
        <li>{t('engage.cert.rule.review')}</li>
        {exam.tasks.some((task) => task.kind === 'speaking') && <li>{t('engage.cert.rule.mic')}</li>}
      </ul>
      <Field label={t('engage.cert.name')} hint={t('engage.cert.nameHint')}>{(id) => <TextInput id={id} required minLength={2} maxLength={60} value={name} onChange={(event) => setName(event.target.value)}/>}</Field>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1"/><span>{t('engage.cert.consent')}</span></label>
      {action.error !== null && <EngageError error={action.error}/>}
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={!consent || name.trim().length < 2 || action.busy !== null}>{t('engage.cert.begin')}</Button><Button variant="ghost" onClick={onClose}>{t('engage.cancel')}</Button></div>
    </form>
  </Dialog>;
}

export function CertificatesPage() {
  const t = useT(), { date } = useI18n(), { me } = useWorkspace();
  const view = useEngage<CertificatesView>('certificates');
  const [starting, setStarting] = useState<Exam | null>(null);
  return <Page eyebrow={<Eyebrow icon={<Award size={14} aria-hidden="true"/>}>{t('engage.cert.eyebrow')}</Eyebrow>} title={t('engage.cert.title')} lead={t('engage.cert.lead')}
    actions={me?.user.is_schood_admin ? <Button variant="secondary" size="sm" onClick={() => navigate('/certificates/review')} icon={<ClipboardCheck size={14} aria-hidden="true"/>}>{t('engage.review.title')}</Button> : undefined}>
    <Loaded {...view}>{(data) => {
      // A purchase may name its exam; one that does not can be used for any exam.
      const canStart = (exam: Exam) => data.available.beta || (data.available.sittings > 0 && (data.available.exams.length === 0 || data.available.exams.includes(exam.key)));
      const open = data.sittings.find((sitting) => sitting.status === 'started');
      return <>
        {open && <Notice tone="warn"><p className="m-0 font-semibold">{t('engage.cert.inProgress', { title: open.title })}</p><Link to={`/certificates/sitting/${open.id}`} className="font-semibold underline underline-offset-2">{t('engage.cert.resume')}</Link></Notice>}
        {data.available.beta ? <Notice>{t('engage.cert.beta')}</Notice> : data.available.sittings > 0 ? <Notice tone="lime">{t('engage.cert.have', { count: data.available.sittings })}</Notice>
          : <Notice>{data.available.for_sale ? t('engage.cert.buy') : t('engage.cert.soon')} <Link to="/plans" className="font-semibold underline underline-offset-2">{t('engage.cert.plans')}</Link></Notice>}
        <div className="grid gap-4 md:grid-cols-2">
          {data.exams.map((exam) => <Card key={exam.key} className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2"><Badge tone="sky">{exam.level}</Badge><Badge><Timer size={12} aria-hidden="true"/>{t('engage.cert.minutes', { count: exam.minutes })}</Badge></div>
            <h2 className="m-0 font-display text-xl font-bold">{exam.title}</h2>
            <p className="m-0 flex-1 text-sm text-gray-700">{exam.lead}</p>
            <p className="m-0 text-xs text-gray-600">{t('engage.cert.pass', { items: Math.round(exam.pass.itemsRatio * 100), rubric: Math.round(exam.pass.rubricRatio * 100) })}</p>
            <div><Button size="sm" disabled={!canStart(exam) || !!open} onClick={() => setStarting(exam)} icon={<ShieldCheck size={14} aria-hidden="true"/>}>{t('engage.cert.start')}</Button></div>
          </Card>)}
        </div>
        <section aria-labelledby="engage-certs" className="flex flex-col gap-3">
          <h2 id="engage-certs" className="m-0 font-display text-xl font-bold">{t('engage.cert.mine')}</h2>
          {data.certificates.length ? <div className="grid gap-4 md:grid-cols-2">{data.certificates.map((certificate) => <Card key={certificate.id} className="flex flex-col items-start gap-3 sm:flex-row">
            <QrCode value={certificate.verify_url} label={t('engage.cert.qr', { code: certificate.code })} size={120}/>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="m-0 inline-flex items-center gap-1 font-semibold"><GraduationCap size={16} aria-hidden="true"/>{certificate.title} · {certificate.level}</p>
              <p className="m-0 font-mono text-sm">{certificate.code}</p>
              <p className="m-0 text-sm text-gray-600">{date(certificate.issued_at, { dateStyle: 'long' })} · {certificate.score}/100</p>
              <div className="flex flex-wrap gap-2">{certificate.revoked ? <Badge tone="danger">{t('engage.verify.revoked')}</Badge> : <Badge tone="lime"><BadgeCheck size={12} aria-hidden="true"/>{t('engage.verify.valid')}</Badge>}{certificate.test && <Badge>{t('engage.cert.test')}</Badge>}</div>
              <Link to={`/verify/${certificate.code}`} className="text-sm font-semibold underline underline-offset-2">{t('engage.cert.verifyPage')}</Link>
            </div>
          </Card>)}</div> : <EmptyState title={t('engage.cert.none')}/>}
        </section>
        {data.sittings.length > 0 && <section aria-labelledby="engage-sittings" className="flex flex-col gap-2">
          <h2 id="engage-sittings" className="m-0 font-display text-lg font-bold">{t('engage.cert.sittings')}</h2>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">{data.sittings.map((sitting) => <li key={sitting.id} className="flex flex-wrap items-center gap-2 rounded-2xl border border-navy-line/30 bg-white p-3 text-sm">
            <span className="min-w-0 flex-1 font-semibold">{sitting.title}</span>
            <span className="text-gray-600">{date(sitting.started_at, { dateStyle: 'medium' })}</span>
            <Badge tone={sitting.status === 'passed' ? 'lime' : sitting.status === 'started' ? 'warn' : 'neutral'}>{t(`engage.cert.status.${sitting.status}`)}</Badge>
            {sitting.auto_score !== null && <span className="text-gray-600">{t('engage.cert.auto', { score: sitting.auto_score, total: sitting.auto_total ?? 0 })}</span>}
          </li>)}</ul>
        </section>}
        {starting && <StartDialog exam={starting} onClose={() => setStarting(null)}/>}
      </>;
    }}</Loaded>
  </Page>;
}

// --- Review queue (Schood admins) -----------------------------------------------------------------------
interface ReviewItem {
  id: string; exam: Exam; submitted_at: string; test: boolean; auto_score: number; auto_total: number; integrity: Record<string, number>; auto_submitted: boolean; display_name: string; mine: boolean;
  timeline: { kind: string; at: string }[];
  tasks: { id: string; kind: string; prompt: string; min_words: number | null; max_words: number | null; text: string | null; words: number | null; duration_ms: number | null; audio_url: string | null }[];
}

function ReviewCard({ item, onDone }: { item: ReviewItem; onDone: () => void }) {
  const t = useT(), { date } = useI18n(), action = useAction();
  const [rubric, setRubric] = useState<Record<string, number>>(Object.fromEntries(item.exam.rubric.map((criterion) => [criterion.id, 0])));
  const [integrity, setIntegrity] = useState<'clear' | 'insufficient_evidence' | 'confirmed'>('clear');
  const [note, setNote] = useState('');
  const decide = async () => { if (await action.run('review-decide', { sitting: item.id, rubric, integrity, ...(note.trim() ? { note: note.trim() } : {}) }, item.id)) onDone(); };
  const total = Object.values(rubric).reduce((sum, value) => sum + value, 0), max = item.exam.rubric.reduce((sum, criterion) => sum + criterion.max, 0);
  return <Card className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="m-0 font-display text-xl font-bold">{item.exam.title} · {item.display_name}</h2>
      <div className="flex flex-wrap gap-2">{item.test && <Badge>{t('engage.cert.test')}</Badge>}{item.auto_submitted && <Badge tone="warn">{t('engage.review.autoSubmitted')}</Badge>}</div>
    </div>
    <p className="m-0 text-sm text-gray-700">{t('engage.review.items', { score: item.auto_score, total: item.auto_total })} · {date(item.submitted_at, { dateStyle: 'medium', timeStyle: 'short' })}</p>
    <div className="flex flex-col gap-1">
      <Eyebrow>{t('engage.review.signals')}</Eyebrow>
      <p className="m-0 text-sm">{Object.keys(item.integrity).filter((kind) => !kind.startsWith('ack:') && kind !== 'auto_submitted').map((kind) => `${t(`engage.signal.${kind}`)}: ${item.integrity[kind]}`).join(' · ') || t('engage.review.noSignals')}</p>
      <p className="m-0 text-xs text-gray-600">{t('engage.review.signalsRule')}</p>
    </div>
    {item.tasks.map((task) => <div key={task.id} className="flex flex-col gap-2 rounded-2xl border border-navy-line/30 bg-cream-soft p-3">
      <p className="m-0 text-sm font-semibold">{task.prompt}</p>
      {task.kind === 'writing' ? <p className="m-0 whitespace-pre-wrap text-sm leading-6">{task.text ?? t('engage.review.noAnswer')}</p>
        : task.audio_url ? <audio controls preload="none" src={task.audio_url} className="w-full"><track kind="captions"/></audio> : <p className="m-0 text-sm">{t('engage.review.noAnswer')}</p>}
      {task.words !== null && <p className="m-0 text-xs text-gray-600">{t('engage.review.words', { count: task.words, min: task.min_words ?? 0, max: task.max_words ?? 0 })}</p>}
    </div>)}
    <div className="grid gap-3 sm:grid-cols-2">
      {item.exam.rubric.map((criterion) => <Field key={criterion.id} label={`${criterion.title} (0–${criterion.max})`}>{(id) => <select id={id} className={selectClass} value={rubric[criterion.id]} onChange={(event) => setRubric({ ...rubric, [criterion.id]: Number(event.target.value) })}>
        {Array.from({ length: criterion.max + 1 }, (_, score) => <option key={score} value={score}>{score}</option>)}
      </select>}</Field>)}
    </div>
    <p className="m-0 text-sm">{t('engage.review.total', { total, max })}</p>
    <fieldset className="m-0 flex flex-col gap-1 border-0 p-0">
      <legend className="mb-1 text-sm font-semibold">{t('engage.review.integrity')}</legend>
      {(['clear', 'insufficient_evidence', 'confirmed'] as const).map((value) => <label key={value} className="flex items-start gap-2 text-sm"><input type="radio" name={`integrity-${item.id}`} checked={integrity === value} onChange={() => setIntegrity(value)} className="mt-1"/><span>{t(`engage.review.integrity.${value}`)}</span></label>)}
    </fieldset>
    <Field label={t('engage.review.note')}>{(id) => <TextInput id={id} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)}/>}</Field>
    {item.mine && <Notice tone="warn">{t('engage.error.reviewer_conflict')}</Notice>}
    {action.error !== null && <EngageError error={action.error}/>}
    <div><Button disabled={item.mine || action.busy !== null} onClick={() => void decide()}>{t('engage.review.decide')}</Button></div>
  </Card>;
}

export function ReviewPage() {
  const t = useT();
  const view = useEngage<{ queue: ReviewItem[] }>('review-queue');
  return <Page eyebrow={<Eyebrow icon={<ClipboardCheck size={14} aria-hidden="true"/>}>{t('engage.cert.eyebrow')}</Eyebrow>} title={t('engage.review.title')} lead={t('engage.review.lead')}>
    <Loaded {...view}>{(data) => data.queue.length ? <>{data.queue.map((item) => <ReviewCard key={item.id} item={item} onDone={() => void view.reload()}/>)}</> : <EmptyState title={t('engage.review.empty')}/>}</Loaded>
  </Page>;
}

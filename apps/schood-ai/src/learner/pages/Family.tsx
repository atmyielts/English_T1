import { useState } from 'react';
import { Copy, UserPlus } from 'lucide-react';
import { Badge, Button, Field, LoadingState, PlanGate, TextArea, TextInput, Thinking, useI18n, useLocation, useT } from '../../core/index.ts';
import { Failure, Section, ToolHeader, useLearnerApi, useLoad, useRun, Cost } from '../kit.tsx';

// Plus Family: link up to 3 children, P1 weekly brief (web and Telegram) and P2
// questions about my child; and the child's side: accept an invite, see who sees
// your progress, unlink.

interface Child { id: string; status: 'invited' | 'active'; child_label: string | null; name: string | null; child_id: string | null; invite_hint: string | null; invite_expires_at: string | null; last_brief: Brief | null }
interface Brief { name: string; no_data?: boolean; effort?: string; progress?: string; praise?: string; watch?: string; suggestion?: string; stats?: { minutes_7d: number; active_days_7d: number; ai_actions_7d: number }; exams?: { name: string | null; band: string | null; score: number | null; date: string | null }[] }
interface Family { can_invite: boolean; limit: number; children: Child[]; parents: { id: string; name: string | null; accepted_at: string | null }[]; schedule: { enabled: boolean; time: string; weekday: number | null; next_at: string | null } | null; telegram_linked: boolean; bot_url: string }

function BriefCard({ brief }: { brief: Brief }) {
  const t = useT();
  return <div className="grid gap-2 rounded-2xl bg-white/85 p-3 text-sm">
    {brief.stats && <p className="m-0 text-gray-700">{t('learner.family.stats', { minutes: brief.stats.minutes_7d, days: brief.stats.active_days_7d, actions: brief.stats.ai_actions_7d })}</p>}
    {brief.no_data ? <p className="m-0">{brief.effort}</p> : (['effort', 'progress', 'praise', 'watch', 'suggestion'] as const).map((key) => brief[key] ? <p key={key} className="m-0"><strong>{t(`learner.family.brief.${key}`)}:</strong> {brief[key]}</p> : null)}
    {brief.exams && brief.exams.length > 0 && <p className="m-0 text-gray-700">{t('learner.family.exams')}: {brief.exams.map((exam) => `${exam.name ?? ''} ${exam.band ?? exam.score ?? ''} (${exam.date ?? ''})`).join(' · ')}</p>}
  </div>;
}

function ChildPanel({ child, onChange }: { child: Child; onChange(): void }) {
  const t = useT(), call = useLearnerApi(), { date } = useI18n();
  const [question, setQuestion] = useState('');
  const ask = useRun<{ answer: string; credits: number }>(), brief = useRun<{ briefs: Brief[] }>(), unlink = useRun<unknown>();
  const name = child.name ?? child.child_label ?? '';
  if (child.status === 'invited') return <li className="grid gap-2 rounded-3xl border border-dashed border-navy-line/50 bg-white/70 p-4 text-sm">
    <span className="flex flex-wrap items-center gap-2 font-semibold">{child.child_label}<Badge tone="warn">{t('learner.family.waiting')}</Badge></span>
    <span className="text-gray-700">{t('learner.family.inviteHint', { hint: child.invite_hint ?? '', date: child.invite_expires_at ? date(child.invite_expires_at, { dateStyle: 'medium' }) : '' })}</span>
    <div><Button variant="ghost" size="sm" onClick={() => void unlink.run(() => call('family-link', { method: 'DELETE', body: { id: child.id } })).then(onChange)}>{t('learner.family.cancel')}</Button></div>
  </li>;
  const latest = brief.data?.briefs[0] ?? child.last_brief;
  return <li className="grid gap-3 rounded-3xl border border-navy-line bg-white/85 p-4">
    <h3 className="m-0 font-display text-lg font-bold">{name}</h3>
    {latest ? <BriefCard brief={latest}/> : <p className="m-0 text-sm text-gray-700">{t('learner.family.noBrief')}</p>}
    <div className="flex flex-wrap items-center gap-3"><Button variant="secondary" size="sm" disabled={brief.busy} onClick={() => void brief.run(() => call('parent-brief', { method: 'POST', body: { child_id: child.child_id } }))}>{brief.busy ? t('chat.thinking') : t('learner.family.briefNow')}</Button><Cost creditKey="parent.brief"/></div>
    <Field label={t('learner.family.ask', { name })} hint={t('learner.family.askHint')}>{(id) => <TextArea id={id} rows={2} value={question} maxLength={1000} onChange={(event) => setQuestion(event.target.value)}/>}</Field>
    <div className="flex flex-wrap items-center gap-3"><Button variant="spark" disabled={!question.trim() || ask.busy} onClick={() => void ask.run(() => call('parent-ask', { method: 'POST', idempotencyKey: crypto.randomUUID(), body: { child_id: child.child_id, question } }))}>{t('learner.family.askGo')}</Button><Cost creditKey="parent.ask"/></div>
    {ask.busy && <Thinking label={t('chat.thinking')}/>}
    {ask.data && <p className="m-0 whitespace-pre-wrap rounded-2xl bg-cream-soft p-3 text-sm">{ask.data.answer}</p>}
    <div><Button variant="ghost" size="sm" onClick={() => { if (confirm(t('learner.family.unlinkConfirm', { name }))) void unlink.run(() => call('family-link', { method: 'DELETE', body: { id: child.id } })).then(onChange); }}>{t('learner.family.unlink')}</Button></div>
    <Failure error={ask.error ?? brief.error ?? unlink.error}/>
  </li>;
}

export function FamilyPage() {
  const t = useT(), call = useLearnerApi();
  const family = useLoad(() => call<Family>('family'));
  const [label, setLabel] = useState(''), [consent, setConsent] = useState(false), [copied, setCopied] = useState(false);
  const [time, setTime] = useState('10:00'), [weekday, setWeekday] = useState(0);
  const invite = useRun<{ invite: { code: string; expires_at: string; url: string } }>(), schedule = useRun<unknown>();
  const data = family.data;
  const days = [0, 1, 2, 3, 4, 5, 6];
  return <div>
    <ToolHeader parent title={t('learner.tool.family')} lead={t('learner.family.lead')}/>
    {family.loading && !data && <LoadingState/>}
    <Failure error={family.error} onRetry={family.reload}/>
    {data && <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid content-start gap-4">
        {data.parents.length > 0 && <Section title={t('learner.family.whoSees')}>
          <ul className="m-0 grid list-none gap-2 p-0">{data.parents.map((parent) => <li key={parent.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white/85 p-3 text-sm">{t('learner.family.parentSees', { name: parent.name ?? '' })}
            <Button variant="ghost" size="sm" onClick={() => { if (confirm(t('learner.family.unlinkConfirm', { name: parent.name ?? '' }))) void call('family-link', { method: 'DELETE', body: { id: parent.id } }).then(family.reload); }}>{t('learner.family.unlink')}</Button></li>)}</ul>
        </Section>}
        <PlanGate feature="P1">
          {data.children.length ? <ul className="m-0 grid list-none gap-3 p-0">{data.children.map((child) => <ChildPanel key={child.id} child={child} onChange={family.reload}/>)}</ul>
            : <p className="m-0 rounded-3xl border border-dashed border-navy-line/40 bg-white/60 p-6 text-sm">{t('learner.family.none')}</p>}
        </PlanGate>
      </div>
      <PlanGate feature="P1"><div className="grid content-start gap-4">
        <Section title={t('learner.family.invite')}>
          <p className="m-0 text-sm text-gray-700">{t('learner.family.inviteLead', { limit: data.limit })}</p>
          <Field label={t('learner.family.childName')}>{(id) => <TextInput id={id} value={label} maxLength={60} onChange={(event) => setLabel(event.target.value)}/>}</Field>
          {/* [VERIFY: owner review] parent consent text */}
          <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1" checked={consent} onChange={(event) => setConsent(event.target.checked)}/>{t('learner.family.consent')}</label>
          <div><Button disabled={!label.trim() || !consent || invite.busy || data.children.length >= data.limit} icon={<UserPlus size={16} aria-hidden="true"/>} onClick={() => void invite.run(() => call<{ invite: { code: string; expires_at: string; url: string } }>('family-invite', { method: 'POST', body: { child_label: label, consent } }).then((out) => { family.reload(); setLabel(''); return out; }))}>{t('learner.family.inviteGo')}</Button></div>
          {invite.data && <div className="grid gap-2 rounded-2xl bg-lime-soft p-3 text-sm">
            <p className="m-0">{t('learner.family.codeLead')}</p>
            <p className="m-0 font-display text-2xl font-bold tracking-widest">{invite.data.invite.code}</p>
            <p className="m-0">{t('learner.family.codeWhere', { url: invite.data.invite.url })}</p>
            <div><Button variant="secondary" size="sm" icon={<Copy size={14} aria-hidden="true"/>} onClick={() => { void navigator.clipboard?.writeText(`${invite.data!.invite.url} ${invite.data!.invite.code}`).then(() => setCopied(true)); }}>{copied ? t('chat.copied') : t('learner.duel.copy')}</Button></div>
          </div>}
          <Failure error={invite.error}/>
        </Section>
        <Section title={t('learner.family.weekly')}>
          {!data.telegram_linked ? <p className="m-0 text-sm">{t('learner.brief.link')}</p> : <>
            <p className="m-0 text-sm">{data.schedule?.enabled ? t('learner.family.weeklyOn', { day: t(`learner.weekday.${data.schedule.weekday ?? 0}`), time: data.schedule.time }) : t('learner.family.weeklyOff')}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('learner.family.day')}>{(id) => <select id={id} value={weekday} onChange={(event) => setWeekday(Number(event.target.value))} className="min-h-11 rounded-xl border border-gray-300 bg-white px-3 text-sm">{days.map((day) => <option key={day} value={day}>{t(`learner.weekday.${day}`)}</option>)}</select>}</Field>
              <Field label={t('learner.brief.time')}>{(id) => <TextInput id={id} type="time" min="08:00" max="21:59" value={time} onChange={(event) => setTime(event.target.value)}/>}</Field>
            </div>
            <div className="flex flex-wrap gap-2"><Button disabled={schedule.busy} onClick={() => void schedule.run(() => call('family', { method: 'PUT', body: { enabled: true, time, weekday, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tashkent' } })).then(family.reload)}>{t('learner.brief.turnOn')}</Button>
              {data.schedule?.enabled && <Button variant="secondary" disabled={schedule.busy} onClick={() => void schedule.run(() => call('family', { method: 'PUT', body: { enabled: false, time: data.schedule!.time, weekday: data.schedule!.weekday ?? 0 } })).then(family.reload)}>{t('learner.brief.turnOff')}</Button>}</div>
            <p className="m-0 text-xs text-gray-600">{t('learner.family.botAsk')}</p>
          </>}
          <Failure error={schedule.error}/>
        </Section>
      </div></PlanGate>
    </div>}
  </div>;
}

/** /family/join: the child enters the code from their parent. */
export function FamilyJoinPage() {
  const t = useT(), call = useLearnerApi(), { query } = useLocation();
  const [code, setCode] = useState(query.get('code') ?? ''), [agree, setAgree] = useState(false);
  const join = useRun<{ linked: { parent: string | null } }>();
  return <div className="mx-auto max-w-xl">
    <ToolHeader title={t('learner.join.title')} lead={t('learner.join.lead')}/>
    {join.data ? <Section title={t('learner.join.done', { name: join.data.linked.parent ?? '' })}><p className="m-0 text-sm">{t('learner.join.doneLead')}</p></Section> : <Section title={t('learner.join.code')}>
      <Field label={t('learner.join.code')}>{(id) => <TextInput id={id} value={code} autoComplete="off" maxLength={11} onChange={(event) => setCode(event.target.value.toUpperCase())}/>}</Field>
      {/* [VERIFY: owner review] what the child agrees to share */}
      <ul className="m-0 list-disc pl-5 text-sm text-gray-700"><li>{t('learner.join.shares')}</li><li>{t('learner.join.notShares')}</li><li>{t('learner.join.unlink')}</li></ul>
      <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1" checked={agree} onChange={(event) => setAgree(event.target.checked)}/>{t('learner.join.agree')}</label>
      <div><Button disabled={code.replace(/[\s-]/g, '').length !== 10 || !agree || join.busy} onClick={() => void join.run(() => call('family-accept', { method: 'POST', body: { code } }))}>{t('learner.join.go')}</Button></div>
      <Failure error={join.error}/>
    </Section>}
  </div>;
}

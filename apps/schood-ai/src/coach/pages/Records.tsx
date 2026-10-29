import { useEffect, useState } from 'react';
import { Award, Copy, ShieldCheck, Trash2, UserMinus } from 'lucide-react';
import { ApiErrorState, Badge, Button, Card, EmptyState, Field, LoadingState, PageHeader, TextInput, useI18n, useLocation, useSession, useT } from '../../core/index.ts';
import { coachApi, type TeamBoard } from '../api.ts';
import { dateText, Loaded, useLoad } from '../ui.tsx';
import { SignedOut } from './common.tsx';

// Certificates (mine, and the public check anyone can open from a share link) and
// Coach Team: a manager's leaderboard of verified practice, invites and members.

const base = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
const anon = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '');

interface PublicCertificate {
  code: string; display_name: string; coach: Record<string, string>; level: string; title: Record<string, string> | null; rubric: Record<string, string> | null;
  results: { at: string; overall: number | null; label: string | null }[]; issued_at: string; revoked: boolean; accent: string | null;
}

export function CoachVerify({ params }: { params: Record<string, string> }) {
  const t = useT(), { locale } = useI18n();
  const [state, setState] = useState<{ cert: PublicCertificate | null; error: boolean; loading: boolean }>({ cert: null, error: false, loading: true });
  useEffect(() => {
    let live = true;
    fetch(`${base}/functions/v1/schood-coach-gate/verify?code=${encodeURIComponent(params.code)}`, { headers: anon ? { apikey: anon, Authorization: `Bearer ${anon}` } : {} })
      .then(async (response) => ({ ok: response.ok, body: await response.json().catch(() => ({})) }))
      .then(({ ok, body }) => { if (live) setState({ cert: ok ? body.certificate : null, error: !ok, loading: false }); }, () => { if (live) setState({ cert: null, error: true, loading: false }); });
    return () => { live = false; };
  }, [params.code]);
  if (state.loading) return <LoadingState/>;
  if (!state.cert) return <EmptyState title={t('coach.verify.missing')} lead={t('coach.verify.missingLead')}/>;
  const cert = state.cert, l = locale as 'en';
  return <div className="flex min-w-0 flex-col gap-4">
    <Card className="flex flex-col gap-3 border-2" style={{ borderColor: cert.accent && /^#[0-9a-f]{6}$/i.test(cert.accent) ? cert.accent : undefined }}>
      <p className="m-0 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-600"><ShieldCheck size={16} aria-hidden="true"/>{t('coach.verify.eyebrow')}</p>
      <h1 className="m-0 font-display text-3xl font-bold">{cert.display_name}</h1>
      <p className="m-0 text-lg">{cert.title?.[l] ?? cert.level} · <b>{cert.coach[l] ?? cert.coach.en}</b></p>
      {cert.revoked ? <Badge tone="danger">{t('coach.verify.revoked')}</Badge> : <Badge tone="lime">{t('coach.verify.valid')}</Badge>}
      <p className="m-0 text-sm text-gray-700">{t('coach.verify.issued', { date: dateText(cert.issued_at, locale), code: cert.code })}</p>
      {cert.results.length > 0 && <div>
        <p className="m-0 text-sm font-semibold">{t('coach.verify.results', { rubric: cert.rubric?.[l] ?? '' })}</p>
        <ul className="m-0 pl-5 text-sm">{cert.results.map((result, index) => <li key={index}>{dateText(result.at, locale)}: <b>{result.label ?? '—'}</b></li>)}</ul>
      </div>}
      <p className="m-0 text-xs leading-5 text-gray-600">{t('coach.verify.note')}</p>
    </Card>
  </div>;
}

export function CoachCertificates() {
  const t = useT(), { locale } = useI18n(), session = useSession();
  const state = useLoad(() => session.status === 'signed_in' ? coachApi.certificates() : Promise.reject(new Error('signed out')), [session.status]);
  const [copied, setCopied] = useState<string | null>(null);
  if (session.status !== 'signed_in') return <SignedOut/>;
  return <div className="flex min-w-0 flex-col gap-4">
    <PageHeader eyebrow={t('coach.eyebrow')} title={t('coach.cert.title')} lead={t('coach.cert.lead')}/>
    <Loaded state={state}>{(data) => data.certificates.length ? <ul className="m-0 flex list-none flex-col gap-3 p-0">
      {data.certificates.map((cert) => <li key={cert.id}><Card className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2"><b className="inline-flex items-center gap-2"><Award size={18} aria-hidden="true"/>{cert.coach} · {cert.level_label}</b>{cert.revoked && <Badge tone="danger">{t('coach.verify.revoked')}</Badge>}</div>
        <p className="m-0 text-sm text-gray-600">{dateText(cert.issued_at, locale)} · {cert.code}</p>
        {!cert.revoked && <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={<Copy size={14} aria-hidden="true"/>} onClick={async () => { try { await navigator.clipboard.writeText(cert.url); setCopied(cert.id); } catch { setCopied(null); } }}>{copied === cert.id ? t('coach.cert.copied') : t('coach.cert.copy')}</Button>
          <Button size="sm" variant="danger" icon={<Trash2 size={14} aria-hidden="true"/>} onClick={async () => { await coachApi.revoke(cert.id); state.reload(); }}>{t('coach.cert.revoke')}</Button>
        </div>}
      </Card></li>)}
    </ul> : <EmptyState title={t('coach.cert.empty')} lead={t('coach.cert.emptyLead')}/>}</Loaded>
  </div>;
}

export function CoachTeam() {
  const t = useT(), session = useSession(), { query } = useLocation();
  const code = query.get('code');
  if (session.status !== 'signed_in') return <SignedOut/>;
  return <div className="flex min-w-0 flex-col gap-4">
    <PageHeader eyebrow={t('coach.eyebrow')} title={t('coach.team.title')} lead={t('coach.team.lead')}/>
    <JoinTeam initial={code ?? ''}/>
    <Teams/>
  </div>;
}

function JoinTeam({ initial }: { initial: string }) {
  const t = useT();
  const [code, setCode] = useState(initial);
  const [state, setState] = useState<{ joined: string | null; error: unknown }>({ joined: null, error: null });
  return <Card className="flex flex-col gap-3">
    <h2 className="m-0 font-display text-lg font-bold">{t('coach.team.join')}</h2>
    <p className="m-0 text-sm text-gray-700">{t('coach.team.joinLead')}</p>
    <Field label={t('coach.team.code')}>{(id) => <TextInput id={id} value={code} maxLength={10} autoComplete="off" onChange={(event) => setCode(event.target.value.trim())}/>}</Field>
    <div><Button disabled={!/^[A-Za-z0-9]{10}$/.test(code)} onClick={async () => { try { const result = await coachApi.joinTeam(code); setState({ joined: result.team.name, error: null }); } catch (error) { setState({ joined: null, error }); } }}>{t('coach.team.joinButton')}</Button></div>
    {state.joined && <p role="status" className="m-0 text-sm">{t('coach.team.joined', { name: state.joined })}</p>}
    {state.error !== null && <ApiErrorState error={state.error}/>}
  </Card>;
}

function Teams() {
  const t = useT();
  const list = useLoad(() => coachApi.teams(), []);
  return <Loaded state={list}>{(data) => <>
    {data.teams.filter((team) => team.role === 'manager').map((team) => <Board key={team.id} teamId={team.id}/>)}
    {data.teams.filter((team) => team.role === 'member').map((team) => <Card key={team.id}><p className="m-0 text-sm">{t('coach.team.member', { name: team.name })}</p></Card>)}
    {!data.teams.length && <EmptyState title={t('coach.team.none')} lead={t('coach.team.noneLead')}/>}
  </>}</Loaded>;
}

function Board({ teamId }: { teamId: string }) {
  const t = useT();
  const board = useLoad(() => coachApi.team(teamId), [teamId]);
  const [invite, setInvite] = useState<{ code: string; links: { pack: string; url: string | null }[]; web: string } | null>(null);
  return <Loaded state={board}>{(data: TeamBoard) => <Card className="flex flex-col gap-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="m-0 font-display text-lg font-bold">{data.team.name}</h2>
      <Badge tone="sky">{t('coach.team.seats', { used: data.team.used, seats: data.team.seats })}</Badge>
    </div>
    <p className="m-0 text-xs text-gray-600">{t('coach.team.privacy')}</p>
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{t('coach.team.board')}</caption>
        <thead><tr>
          <th scope="col" className="px-2 py-1 text-left">#</th><th scope="col" className="px-2 py-1 text-left">{t('coach.team.name')}</th>
          <th scope="col" className="px-2 py-1 text-right">{t('coach.team.weekMinutes')}</th><th scope="col" className="px-2 py-1 text-right">{t('coach.team.results')}</th>
          <th scope="col" className="px-2 py-1 text-right">{t('coach.team.days')}</th><th scope="col" className="px-2 py-1"><span className="sr-only">{t('coach.team.actions')}</span></th>
        </tr></thead>
        <tbody>{data.leaderboard.map((row, index) => <tr key={row.user_id} className="border-t border-navy-line/15">
          <td className="px-2 py-2">{index + 1}</td>
          <td className="px-2 py-2"><b>{row.name}</b>{row.role === 'manager' && <> <Badge>{t('coach.team.manager')}</Badge></>}</td>
          <td className="px-2 py-2 text-right tabular-nums">{row.week.minutes}</td>
          <td className="px-2 py-2 text-right tabular-nums">{row.week.results}</td>
          <td className="px-2 py-2 text-right tabular-nums">{row.week.active_days}</td>
          <td className="px-2 py-2 text-right">{row.role !== 'manager' && <Button size="sm" variant="ghost" aria-label={t('coach.team.remove', { name: row.name })} onClick={async () => { await coachApi.removeMember(teamId, row.user_id); board.reload(); }} icon={<UserMinus size={14} aria-hidden="true"/>}/>}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div><Button variant="secondary" onClick={async () => setInvite(await coachApi.invite(teamId))}>{t('coach.team.invite')}</Button></div>
    {invite && <div className="flex flex-col gap-1 text-sm">
      <p className="m-0">{t('coach.team.inviteCode', { code: invite.code })}</p>
      {invite.links.filter((link) => link.url).map((link) => <a key={link.pack} href={link.url!} target="_blank" rel="noopener" className="break-all underline">{link.url}</a>)}
      <a href={invite.web} className="break-all underline">{invite.web}</a>
    </div>}
  </Card>}</Loaded>;
}

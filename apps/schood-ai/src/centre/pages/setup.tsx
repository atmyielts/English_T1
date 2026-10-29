import { useEffect, useState, type FormEvent } from 'react';
import { Building2, CheckCircle2, Link2, Ticket } from 'lucide-react';
import { api, BrandMark, Button, Card, EmptyState, Field, LoadingState, PageHeader, TextInput, navigate, useLocation, useWorkspace } from '../../core/index.ts';
import { ApiErrorState, useSubmit, useT } from '../kit.tsx';

// C1: create the centre workspace (from an Academy tenant the person owns or runs)
// and join a centre with an invite code or link.

interface Academy { id: string; name: string; role: string; can_link: boolean; linked: boolean; workspace_id: string | null }

export function SetupPage() {
  const t = useT(), workspace = useWorkspace();
  const [academies, setAcademies] = useState<Academy[] | null>(null), [error, setError] = useState<unknown>(null);
  const submit = useSubmit();
  useEffect(() => {
    api<{ academies: Academy[] }>('centre/academies').then((result) => setAcademies(result.academies)).catch(setError);
  }, []);
  const open = async (id: string) => { workspace.setWorkspace(id); await workspace.refresh(); navigate('/centre'); };
  const link = (academy: Academy) => submit.run(async () => {
    const result = await api<{ workspace: { id: string } }>('centre/create', { body: { academy_id: academy.id } });
    workspace.setWorkspace(result.workspace.id);
    navigate('/centre');
  });
  return <>
    <PageHeader eyebrow={<span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-gray-600"><Building2 size={14} aria-hidden="true"/>{t('centre.setup.eyebrow')}</span>} title={t('centre.setup.title')} lead={t('centre.setup.lead')}/>
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <Card>
        <h2 className="m-0 font-display text-lg font-bold">{t('centre.setup.academy.title')}</h2>
        <p className="m-0 mt-1 text-sm leading-6 text-gray-700">{t('centre.setup.academy.lead')}</p>
        <div className="mt-4">
          {error ? <ApiErrorState error={error}/> : !academies ? <LoadingState/> : !academies.length ? <EmptyState title={t('centre.setup.academy.none')} lead={t('centre.setup.academy.noneLead')}/> :
            <ul className="m-0 grid list-none gap-3 p-0">{academies.map((academy) => <li key={academy.id} className="flex flex-col gap-3 rounded-2xl border border-navy-line/30 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><p className="m-0 font-semibold">{academy.name}</p><p className="m-0 text-xs text-gray-600">{t('centre.setup.academy.role', { role: academy.role })}</p></div>
              {academy.workspace_id ? <Button variant="secondary" onClick={() => void open(academy.workspace_id!)}>{t('centre.setup.academy.open')}</Button>
                : academy.linked ? <span className="text-sm text-gray-700">{t('centre.setup.academy.linkedOther')}</span>
                : academy.can_link ? <Button onClick={() => void link(academy)} disabled={submit.busy} icon={<Link2 size={16} aria-hidden="true"/>}>{submit.busy ? t('centre.common.working') : t('centre.setup.academy.link')}</Button>
                : <span className="text-sm text-gray-700">{t('centre.setup.academy.needOwner')}</span>}
            </li>)}</ul>}
          {submit.error !== null && <div className="mt-3"><ApiErrorState error={submit.error}/></div>}
        </div>
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="m-0 font-display text-lg font-bold">{t('centre.setup.other.title')}</h2>
        <p className="m-0 text-sm leading-6 text-gray-700">{t('centre.setup.other.lead')}</p>
        <a className="text-sm font-semibold text-gray-900 underline underline-offset-2" href="https://schood.online/support">{t('centre.setup.other.contact')}</a>
        <hr className="my-2 border-navy-line/20"/>
        <p className="m-0 text-sm text-gray-700">{t('centre.setup.joinLead')}</p>
        <div><Button variant="secondary" onClick={() => navigate('/join')} icon={<Ticket size={16} aria-hidden="true"/>}>{t('centre.gate.join')}</Button></div>
      </Card>
    </div>
  </>;
}

export function JoinPage() {
  const t = useT(), workspace = useWorkspace(), { query } = useLocation();
  const [code, setCode] = useState(query.get('code') ?? '');
  const [preview, setPreview] = useState<{ centre: { name: string; logo_url: string | null; primary_color: string | null }; role: string; state: string; member: boolean } | null>(null);
  const [previewError, setPreviewError] = useState<unknown>(null);
  const submit = useSubmit();
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  useEffect(() => {
    setPreview(null); setPreviewError(null);
    if (clean.length !== 10) return;
    const timer = setTimeout(() => { api<typeof preview>('centre/invite-preview', { query: { code: clean } }).then(setPreview).catch(setPreviewError); }, 250);
    return () => clearTimeout(timer);
  }, [clean]);
  const join = (event: FormEvent) => {
    event.preventDefault();
    void submit.run(async () => {
      const result = await api<{ workspace: { id: string } }>('centre/join', { body: { code: clean } });
      workspace.setWorkspace(result.workspace.id);
      await workspace.refresh();
      navigate('/');
    });
  };
  return <>
    <PageHeader title={t('centre.join.title')} lead={t('centre.join.lead')}/>
    <Card className="max-w-xl">
      <form onSubmit={join} className="flex flex-col gap-4">
        <Field label={t('centre.join.code')} hint={t('centre.join.codeHint')}>{(id) => <TextInput id={id} value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} maxLength={20} required placeholder="ABCDE-23456" className="font-mono uppercase tracking-widest"/>}</Field>
        {preview && <div className="flex items-center gap-3 rounded-2xl border border-navy-line/30 bg-cream-soft p-3">
          <BrandMark name={preview.centre.name} logo={preview.centre.logo_url} color={preview.centre.primary_color} size={36}/>
          <div className="min-w-0"><p className="m-0 font-semibold">{preview.centre.name}</p><p className="m-0 text-xs text-gray-700">{preview.member ? t('centre.join.already') : preview.state === 'active' ? t('centre.join.as', { role: t(`role.${preview.role}`) }) : t(`centre.join.state.${preview.state}`)}</p></div>
          {preview.member && <CheckCircle2 size={18} className="ml-auto text-green-700" aria-hidden="true"/>}
        </div>}
        {previewError !== null && <p className="m-0 text-sm text-amber-900" role="status">{t('error.invite_invalid')}</p>}
        <div><Button type="submit" disabled={clean.length !== 10 || submit.busy}>{submit.busy ? t('centre.common.working') : t('centre.join.submit')}</Button></div>
        {submit.error !== null && <ApiErrorState error={submit.error}/>}
      </form>
    </Card>
  </>;
}

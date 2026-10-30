import { useState } from 'react';
import { CheckCircle2, Link2, Send } from 'lucide-react';
import { ApiError, ApiErrorState, Button, Card, PageHeader, useSession, useT } from '../../core/index.ts';
import { coachApi } from '../api.ts';
import { openOutside } from '../telegram-session.ts';
import { SignedOut } from './common.tsx';

// /coach/<pack>/link: links this Schood account to Telegram through the existing
// telegram-link flow, so the coach bot (and every Schood bot) knows the person.
// The link opens this coach's bot with a one-time token; Telegram does the rest.

export function CoachLink({ params }: { params: Record<string, string> }) {
  const t = useT(), session = useSession();
  return <div className="flex min-w-0 flex-col gap-4">
    <PageHeader eyebrow={t('coach.eyebrow')} title={t('coach.link.title')} lead={t('coach.link.webLead')}/>
    {session.status === 'signed_in' ? <LinkSteps pack={params.pack}/> : <SignedOut pack={params.pack}/>}
  </div>;
}

function LinkSteps({ pack }: { pack: string }) {
  const t = useT();
  const [state, setState] = useState<{ busy: boolean; url: string | null; linked: boolean; error: unknown; token: string | null; confirmed: boolean }>({ busy: false, url: null, linked: false, error: null, token: null, confirmed: false });
  const start = async () => {
    setState((current) => ({ ...current, busy: true, error: null }));
    try {
      const result = await coachApi.link(pack);
      const token = /[?&]start=([A-Za-z0-9_-]+)/.exec(result.url)?.[1] ?? null;
      setState({ busy: false, url: result.url, linked: result.linked, error: null, token, confirmed: false });
      openOutside(result.url);
    } catch (error) { setState((current) => ({ ...current, busy: false, error })); }
  };
  const confirm = async () => {
    if (!state.token) return;
    try { await coachApi.confirmLink(state.token); setState((current) => ({ ...current, confirmed: true })); }
    catch (error) { setState((current) => ({ ...current, error })); }
  };
  return <Card className="flex flex-col gap-4">
    <ol className="m-0 flex flex-col gap-2 pl-5 text-sm leading-6 text-gray-800">
      <li>{t('coach.link.step1')}</li>
      <li>{t('coach.link.step2')}</li>
      <li>{t('coach.link.step3')}</li>
    </ol>
    <div className="flex flex-wrap gap-2">
      <Button onClick={() => void start()} disabled={state.busy} icon={state.linked ? <Send size={16} aria-hidden="true"/> : <Link2 size={16} aria-hidden="true"/>}>{state.linked ? t('coach.bot.open') : t('coach.link.button')}</Button>
      {state.url && !state.linked && <Button variant="secondary" onClick={() => void confirm()} icon={<CheckCircle2 size={16} aria-hidden="true"/>}>{t('coach.link.confirm')}</Button>}
    </div>
    {state.url && <p className="m-0 break-all text-xs text-gray-600">{t('coach.link.manual')} <a href={state.url} target="_blank" rel="noopener" className="underline">{state.url}</a></p>}
    {state.confirmed && <p role="status" className="m-0 text-sm text-gray-800">{t('coach.link.confirmed')}</p>}
    {state.linked && <p role="status" className="m-0 text-sm text-gray-800">{t('coach.link.already')}</p>}
    {state.error !== null && (state.error instanceof ApiError && state.error.code === 'coach_not_configured' ? <p className="m-0 text-sm text-gray-700">{t('coach.bot.soon')}</p> : <ApiErrorState error={state.error}/>)}
  </Card>;
}

import React, { useCallback, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { configured, observeAccount, supabase } from '../../../packages/assessment-web/src/client';
import { accountLink } from '../../../packages/assessment-web/src/account-links';
import { ServiceHeader } from '../../../packages/service-design/src/ServiceHeader';
import { I18nProvider, LocaleSwitcher } from '../../../packages/service-i18n/src/i18n.tsx';
import { admission, type Goal, type LearnerState, type Mode } from './api.ts';
import { catalogs, useAppT, useErrorText } from './i18n/index.ts';
import { GoalForm } from './GoalForm';
import { Practice } from './Practice';
import { Progress } from './Progress';
import { Today } from './Today';
import '../../../packages/service-design/src/platform.css';
import './style.css';

type View = { name: 'today' | 'progress' | 'goal' } | { name: 'practice'; mode: Mode; topic?: string };

function App() {
  const t = useAppT(), problem = useErrorText();
  const [user, setUser] = useState(''), [email, setEmail] = useState(''), [password, setPassword] = useState('');
  const [state, setState] = useState<LearnerState | null>(null), [view, setView] = useState<View>({ name: 'today' });
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  useEffect(() => observeAccount(setUser), []);
  const refresh = useCallback(async (actor: string) => {
    try {
      setState(await admission<LearnerState>('state', 'GET', undefined, actor));
      setError('');
    } catch (cause) {
      setError(problem(cause));
    }
  }, []);
  useEffect(() => {
    setState(null); setView({ name: 'today' }); setNotice('');
    if (user) void refresh(user);
  }, [user, refresh]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await action(); } catch (cause) { setError(problem(cause)); } finally { setBusy(false); }
  }
  async function saveGoal(goal: Goal) {
    await run(async () => {
      setState(await admission<LearnerState>('goal', 'PUT', goal, user));
      setNotice(t('goal.saved'));
      setView({ name: 'today' });
    });
  }
  const start = (mode: Mode, topic?: string) => { setNotice(''); setView({ name: 'practice', mode, topic }); scrollTo(0, 0); };

  if (!configured) return <main className="configuration"><h1>{t('app.title')}</h1><p>{t('app.notConfigured')}</p></main>;
  if (!user) return <main className="signin">
    <div className="brand">Schood <span>{t('app.name')}</span></div>
    <LocaleSwitcher label={t('locale.label')}/>
    <h1>{t('signin.title')}</h1>
    <p>{t('signin.lead')}</p>
    <form onSubmit={(event: FormEvent) => { event.preventDefault(); void run(async () => { const { error } = await supabase!.auth.signInWithPassword({ email, password }); if (error) throw error; }); }}>
      <label>{t('signin.email')}<input type="email" required autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)}/></label>
      <label>{t('signin.password')}<input type="password" required autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)}/></label>
      <button disabled={busy}>{t('signin.submit')}</button>
    </form>
    <p className="account-links"><a href={accountLink('signup')}>{t('account.create')}</a><a href={accountLink('forgot')}>{t('account.forgot')}</a></p>
    {error && <p className="error" role="alert">{error}</p>}
  </main>;

  const needsGoal = state !== null && state.goal === null;
  const nav = state && !needsGoal ? ([['today', 'nav.today'], ['progress', 'nav.progress'], ['goal', 'nav.goal']] as const).map(([name, label]) => ({
    id: name, label: t(label), active: view.name === name, onClick: () => { setNotice(''); setView({ name }); if (name === 'today') void refresh(user); },
  })) : [];
  return <div className="workspace admission">
    <ServiceHeader service={t('app.name')} nav={nav} labels={{ skip: t('header.skip'), home: t('header.home'), menu: t('header.menu'), workspace: t('header.workspace', { service: t('app.name') }) }}>
      <button className="quiet" disabled={busy} onClick={() => void run(async () => { const { error } = await supabase!.auth.signOut({ scope: 'local' }); if (error) throw error; setPassword(''); })}>{t('header.signOut')}</button>
      <LocaleSwitcher label={t('locale.label')}/>
    </ServiceHeader>
    <main id="workspace-main" tabIndex={-1} className="admission-main" aria-busy={!state && !error}>
      {error && <p role="alert" className="error">{error}</p>}
      {notice && <p role="status" className="notice">{notice}</p>}
      {!state ? !error && <p role="status">{t('app.loading')}</p>
        : needsGoal || view.name === 'goal' ? <GoalForm goal={state.goal} busy={busy} onSave={(goal) => void saveGoal(goal)}/>
        : view.name === 'practice' ? <Practice key={`${view.mode}:${view.topic ?? ''}`} mode={view.mode} topic={view.topic} actor={user} onExit={() => { setView({ name: 'today' }); void refresh(user); }}/>
        : view.name === 'progress' ? <Progress state={state} start={start}/>
        : <Today state={state} start={start}/>}
    </main>
    <footer>{t('app.footer')}</footer>
  </div>;
}

createRoot(document.getElementById('root')!).render(<I18nProvider catalogs={catalogs}><App/></I18nProvider>);

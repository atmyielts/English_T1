import { Calculator, Clock } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PracticeTopNav } from '../components/PracticeTopNav';
import { moduleStart } from '../lib/api';
import { useAccess } from '../lib/useAccess';
import { useAppT, useErrorText } from '../i18n';

export const ModulesPage = () => {
  const t = useAppT();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const { accessToken } = useAccess();
  const [profile, setProfile] = useState<'standard' | 'harder'>('standard');
  const [busy, setBusy] = useState<'reading_writing' | 'math' | null>(null);
  const [error, setError] = useState<unknown>(null);
  const guard = useRef(false);
  const start = async (section: 'reading_writing' | 'math') => {
    if (!accessToken || guard.current) return;
    guard.current = true; setBusy(section); setError(null);
    try {
      const res = await moduleStart(accessToken, { section, profile });
      navigate(`/lab/${res.attempt.id}`, { state: { selection: res.selection ?? null } });
    } catch (err) { setError(err); } finally { guard.current = false; setBusy(null); }
  };
  const card = (section: 'reading_writing' | 'math') => <article className="panel module-card" key={section}>
    <h2>{t(section === 'math' ? 'modules.math.title' : 'modules.rw.title')}</h2>
    <p className="module-meta">{section === 'math' ? <Calculator size={18} aria-hidden="true" /> : <Clock size={18} aria-hidden="true" />}{t(section === 'math' ? 'modules.math.meta' : 'modules.rw.meta')}</p>
    <button type="button" className="btn solid" disabled={busy !== null || !accessToken} onClick={() => void start(section)}>
      {busy === section ? t('modules.starting') : t('modules.start')}
    </button>
  </article>;
  return (
    <div className="app-shell">
      <PracticeTopNav />
      <main className="workspace narrow">
        <header className="page-header">
          <div>
            <p className="eyebrow">{t('modules.eyebrow')}</p>
            <h1>{t('modules.title')}</h1>
            <p>{t('modules.lead')}</p>
          </div>
        </header>
        {error ? <div className="alert error" role="alert">{errorText(error)}</div> : null}
        <fieldset className="panel profile-choice">
          <legend>{t('modules.profile')}</legend>
          {(['standard', 'harder'] as const).map(p => <label key={p} className="radio-row">
            <input type="radio" name="module-profile" value={p} checked={profile === p} onChange={() => setProfile(p)} />
            <span>{t(`modules.profile.${p}`)}</span>
          </label>)}
        </fieldset>
        <section className="module-grid">{card('reading_writing')}{card('math')}</section>
        <p className="muted">{t('modules.adaptiveNote')}</p>
      </main>
    </div>
  );
};

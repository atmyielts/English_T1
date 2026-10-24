import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LocaleSwitcher } from '../../../../packages/service-i18n/src/i18n.tsx';
import { useEnglish } from '../app/EnglishContext';
import { useT } from '../i18n';
import { LevelBadge, PageHeader, Panel } from '../ui/kit';
import { Onboarding } from './Onboarding';
import { NotificationsPanel } from './NotificationsPanel';
import { GoalSettingsPanel } from './goal/GoalSettingsPanel';
import { LeagueSettingsPanel } from '../components/LeagueSettingsPanel';
import { InstallPanel } from '../components/InstallApp';
import { ProgressLinksPanel } from '../components/ProgressLinksPanel';

export const SettingsPage = () => {
  const t = useT();
  const navigate = useNavigate();
  const { onboarding, accountHref, signOut } = useEnglish();
  const [editing, setEditing] = useState(false);
  const value = onboarding.value;

  if (editing) return <Onboarding retake onDone={() => navigate('/today')} />;

  return (
    <>
      <PageHeader eyebrow={t('settings.eyebrow')} title={t('settings.title')} />
      <div className="en-grid-2">
        <Panel title={t('settings.plan.title')}>
          {value ? (
            <div className="en-stats">
              <div className="en-stat"><small>{t('settings.plan.level')}</small><strong>{value.level ? <LevelBadge level={value.level} /> : '—'}</strong></div>
              <div className="en-stat"><small>{t('settings.plan.target')}</small><strong>{value.targetLevel ? <LevelBadge level={value.targetLevel} muted /> : '—'}</strong></div>
              <div className="en-stat"><small>{t('settings.plan.minutes')}</small><strong>{t('common.minutesShort', { count: value.dailyMinutes })}</strong></div>
            </div>
          ) : null}
          {value?.goalKeys.length ? <p>{value.goalKeys.map((goal) => t(`goal.${goal}`)).join(' · ')}</p> : null}
          <div className="en-actions"><button type="button" onClick={() => setEditing(true)}>{t('settings.plan.edit')}</button></div>
        </Panel>
        <div className="en-stack">
          <Panel title={t('settings.language.title')}>
            <p className="hint">{t('settings.language.lead')}</p>
            <LocaleSwitcher label={t('settings.language.title')} />
          </Panel>
          <InstallPanel />
          <GoalSettingsPanel />
          <NotificationsPanel />
          <ProgressLinksPanel />
          <LeagueSettingsPanel />
          <Panel title={t('settings.account.title')}>
            <div className="en-actions">
              <a className="en-button-quiet" href={accountHref}>{t('settings.account.open')}</a>
              <button type="button" className="quiet" onClick={() => void signOut()}>{t('nav.signOut')}</button>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
};

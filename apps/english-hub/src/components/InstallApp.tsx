import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useEnglish } from '../app/EnglishContext';
import { useT } from '../i18n';
import { focusSkillOf } from '../lib/focusSkill';
import {
  dismissInstallCard,
  installCardDismissed,
  postponeUpdate,
  promptInstall,
  reloadForUpdate,
  usePwa,
  visitCount,
} from '../lib/pwa';
import { shouldShowInstallCard } from '../lib/pwaManifest';
import { skillByKey, type SkillKey } from '../lib/skills';
import { Panel } from '../ui/kit';
import '../pwa.css';

const IosSteps = () => {
  const t = useT();
  return (
    <div className="en-pwa-ios">
      <strong>{t('pwa.install.iosTitle')}</strong>
      <ol className="en-pwa-steps">
        <li>{t('pwa.install.iosStep1')}</li>
        <li>{t('pwa.install.iosStep2')}</li>
        <li>{t('pwa.install.iosStep3')}</li>
      </ol>
    </div>
  );
};

/** Settings: how to install on this device. Hidden inside the installed app. */
export const InstallPanel = () => {
  const t = useT();
  const pwa = usePwa();
  const { access } = useEnglish();
  const [declined, setDeclined] = useState(false);
  const focus = skillByKey(focusSkillOf(access));

  if (pwa.standalone) return null;

  const install = async () => {
    const outcome = await promptInstall();
    setDeclined(outcome === 'dismissed');
  };

  return (
    <Panel title={t('pwa.install.title')}>
      <p className="hint">{t('pwa.install.lead')}</p>
      {pwa.installed ? (
        <p className="en-notice">{t('pwa.install.done')}</p>
      ) : pwa.canPrompt ? (
        <div className="en-actions"><button type="button" onClick={() => void install()}>{t('pwa.install.cta')}</button></div>
      ) : pwa.ios ? (
        <IosSteps />
      ) : (
        <p className="hint">{declined ? t('pwa.install.declined') : t('pwa.install.manual')}</p>
      )}
      {focus && !pwa.installed ? (
        <>
          <p className="hint">{t('pwa.install.skillHint', { skill: t(`skill.${focus.key}`) })}</p>
          <div className="en-actions">
            <Link className="en-button-quiet" to={focus.path}>{t('pwa.install.skillOpen', { skill: t(`skill.${focus.key}`) })}</Link>
          </div>
        </>
      ) : null}
    </Panel>
  );
};

/** Today: a one-time, dismissible nudge from the learner's 2nd visit, only where installing works. */
export const InstallCard = () => {
  const t = useT();
  const pwa = usePwa();
  const [dismissed, setDismissed] = useState(installCardDismissed);
  const [visits] = useState(visitCount);

  if (pwa.installed || !shouldShowInstallCard({ ...pwa, dismissed, visits })) return null;

  const close = () => {
    dismissInstallCard();
    setDismissed(true);
  };
  const install = async () => {
    if ((await promptInstall()) !== 'unavailable') close();
  };

  return (
    <Panel title={t('pwa.card.title')} tone="teal" className="en-pwa-card">
      <p>{t('pwa.card.body')}</p>
      {pwa.canPrompt ? null : <IosSteps />}
      <div className="en-actions">
        {pwa.canPrompt ? <button type="button" onClick={() => void install()}>{t('pwa.install.cta')}</button> : null}
        <button type="button" className="quiet" onClick={close}>{t('pwa.card.dismiss')}</button>
      </div>
    </Panel>
  );
};

/** Skill rail: install this skill as its own app ("Schood Speaking"). Shown only when the browser offers it. */
export const RailInstallButton = ({ skill }: { skill: SkillKey }) => {
  const t = useT();
  const pwa = usePwa();
  if (pwa.standalone || !pwa.canPrompt) return null;
  return (
    <button type="button" className="is-link" onClick={() => void promptInstall()}>
      {t('pwa.rail.install', { skill: t(`skill.${skill}`) })}
    </button>
  );
};

/** A small, non-blocking prompt when a newer build is live. */
export const UpdatePrompt = () => {
  const t = useT();
  const { updateReady } = usePwa();
  if (!updateReady) return null;
  return (
    <div className="en-pwa-update" role="status" aria-live="polite">
      <span>{t('pwa.update.body')}</span>
      <span className="en-pwa-update-actions">
        <button type="button" className="is-lime" onClick={reloadForUpdate}>{t('pwa.update.reload')}</button>
        <button type="button" className="is-link" onClick={postponeUpdate}>{t('pwa.update.later')}</button>
      </span>
    </div>
  );
};

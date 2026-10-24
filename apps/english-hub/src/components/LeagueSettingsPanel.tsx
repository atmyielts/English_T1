import { useState } from 'react';
import { useT } from '../i18n';
import { ApiError } from '../lib/api';
import { useResource } from '../lib/useResource';
import { getLeagueSettings, saveLeagueSettings, type LeagueSettings } from '../lib/xp';
import { Loading, Panel } from '../ui/kit';

/** Privacy for weekly leagues: hide the name (still ranked) or leave leagues (not ranked). */
export const LeagueSettingsPanel = () => {
  const t = useT();
  const remote = useResource((signal) => getLeagueSettings(signal), []);
  const [local, setLocal] = useState<LeagueSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = local ?? remote.data?.settings ?? null;

  const save = async (patch: Partial<LeagueSettings>) => {
    setSaving(true);
    setError(null);
    try {
      setLocal((await saveLeagueSettings(patch)).settings);
    } catch (cause) {
      setError(cause instanceof ApiError && cause.code === 'english_onboarding_required' ? t('xp.settings.needsPlacement') : t('xp.settings.error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Panel title={t('xp.settings.title')}>
      {!value ? (remote.error ? null : <Loading lines={2} />) : (
        <>
          <p className="hint">{t('xp.settings.lead')}</p>
          <label className="en-toggle">
            <input type="checkbox" checked={!value.opted_out} disabled={saving} onChange={(event) => void save({ opted_out: !event.target.checked })} />
            <span>{t('xp.settings.join')}</span>
          </label>
          {!value.opted_out ? (
            <label className="en-toggle">
              <input type="checkbox" checked={value.hidden} disabled={saving} onChange={(event) => void save({ hidden: event.target.checked })} />
              <span>{t('xp.settings.hide')}</span>
            </label>
          ) : null}
          <p className="hint">{t('xp.settings.leaveNote')}</p>
        </>
      )}
      {error || (remote.error && !value) ? <p className="en-error" role="alert">{error ?? t('xp.league.error')}</p> : null}
    </Panel>
  );
};

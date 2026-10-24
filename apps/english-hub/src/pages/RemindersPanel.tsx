import { useState } from 'react';
import { useEnglish } from '../app/EnglishContext';
import { useI18n, useT } from '../i18n';
import { getReminders, saveReminders, type ReminderSettings } from '../lib/hub';
import { useResource } from '../lib/useResource';
import { Loading, Panel } from '../ui/kit';

/** Opt-in Telegram nudge on days without practice, a Sunday summary and a daily review quiz. */
export const RemindersPanel = () => {
  const t = useT();
  const { locale } = useI18n();
  const { telegramHref } = useEnglish();
  const remote = useResource((signal) => getReminders(signal), []);
  const [local, setLocal] = useState<ReminderSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = local ?? remote.data;

  const save = async (patch: Partial<Pick<ReminderSettings, 'enabled' | 'hour' | 'weekly' | 'quiz'>>) => {
    setSaving(true);
    setError(null);
    try {
      // The reminder is written in the language the learner uses here.
      setLocal(await saveReminders({ ...patch, locale: locale as ReminderSettings['locale'] }));
    } catch {
      setError(t('reminders.error'));
    } finally {
      setSaving(false);
    }
  };

  const hours = value ? Array.from({ length: value.hours.max - value.hours.min + 1 }, (_, index) => value.hours.min + index) : [];

  return (
    <Panel title={t('reminders.title')}>
      {!value ? <Loading lines={2} /> : !value.telegram_linked ? (
        <>
          <p className="hint">{t('reminders.linkFirst')}</p>
          <div className="en-actions"><a className="en-button-quiet" href={telegramHref}>{t('reminders.link')}</a></div>
        </>
      ) : (
        <>
          <p className="hint">{t('reminders.lead')}</p>
          <label className="en-toggle">
            <input type="checkbox" checked={value.enabled} disabled={saving} onChange={(event) => void save({ enabled: event.target.checked })} />
            <span>{t('reminders.daily')}</span>
          </label>
          {value.enabled ? (
            <label className="en-toggle">
              <input type="checkbox" checked={value.weekly} disabled={saving} onChange={(event) => void save({ weekly: event.target.checked })} />
              <span>{t('reminders.weekly')}</span>
            </label>
          ) : null}
          <label className="en-toggle">
            <input type="checkbox" checked={Boolean(value.quiz)} disabled={saving} onChange={(event) => void save({ quiz: event.target.checked })} />
            <span>{t('tgreview.toggle')}</span>
          </label>
          {Boolean(value.quiz) ? <p className="hint">{t('tgreview.hint')}</p> : null}
          {value.enabled || value.quiz ? (
            <>
              <label className="en-field-inline">
                <span>{t('reminders.hour')}</span>
                <select value={value.hour} disabled={saving} onChange={(event) => void save({ hour: Number(event.target.value) })}>
                  {hours.map((hour) => <option key={hour} value={hour}>{`${String(hour).padStart(2, '0')}:00`}</option>)}
                </select>
              </label>
              <p className="hint">{t('reminders.note')}</p>
            </>
          ) : null}
        </>
      )}
      {error || remote.error ? <p className="en-error" role="alert">{error ?? t('reminders.error')}</p> : null}
    </Panel>
  );
};

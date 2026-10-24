import { L1NoteBody } from '../components/L1Why';
import { useI18n, useT } from '../i18n';
import { useL1Library } from '../lib/l1';
import { getL1Traps } from '../lib/practice';
import { useResource } from '../lib/useResource';
import { ErrorState, Loading, Panel, Tag } from '../ui/kit';

/** Progress: the learner's top three first-language traps, from their own mistakes. */
export const TrapsPanel = () => {
  const t = useT();
  const { locale } = useI18n();
  const traps = useResource((signal) => getL1Traps(signal), []);
  const library = useL1Library();
  const items = (traps.data?.traps ?? []).flatMap((trap) => {
    const note = library?.l1NoteById(trap.id);
    return note ? [{ trap, note }] : [];
  });

  return (
    <Panel title={t('traps.title')}>
      <p className="hint">{t('traps.lead')}</p>
      {(traps.loading && !traps.data) || (traps.data && traps.data.traps.length > 0 && !library) ? <Loading lines={3} /> : null}
      {traps.error ? <ErrorState error={traps.error} onRetry={traps.reload} /> : null}
      {traps.data && traps.data.traps.length === 0 ? <p>{t('traps.empty')}</p> : null}
      {items.length ? (
        <ul className="en-list">
          {items.map(({ trap, note }) => (
            <li key={trap.id}>
              <details className="en-l1">
                <summary>
                  {note.title[locale]} <Tag>{t('traps.count', { count: trap.count })}</Tag>
                </summary>
                <L1NoteBody note={note} mine={trap.example} />
              </details>
            </li>
          ))}
        </ul>
      ) : null}
    </Panel>
  );
};

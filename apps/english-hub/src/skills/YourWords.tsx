import { useT } from '../i18n';

export type YourWord = { id: string; word: string; definition: string | null };

/** Saved words suggested in a writing or speaking task. Using them counts as review. */
export const YourWordsHint = ({ words }: { words: YourWord[] }) => {
  const t = useT();
  if (!words.length) return null;
  return (
    <div className="en-explain" aria-label={t('words.hint.title')}>
      <strong>{t('words.hint.title')}</strong> {t('words.hint.body')}
      <ul className="en-row" style={{ listStyle: 'none', padding: 0, margin: '.5rem 0 0', gap: '.4rem' }}>
        {words.map((entry) => (
          <li key={entry.id} className="en-tag" lang="en" title={entry.definition ?? undefined}>
            {entry.word}{entry.definition ? <span className="visually-hidden">: {entry.definition}</span> : null}
          </li>
        ))}
      </ul>
    </div>
  );
};

/** After submitting: which saved words the learner used. */
export const YourWordsResult = ({ suggested, used }: { suggested: YourWord[]; used: string[] }) => {
  const t = useT();
  if (!suggested.length) return null;
  return used.length
    ? <p className="en-notice">{t('words.result.used', { words: used.join(', '), count: used.length })}</p>
    : <p className="hint">{t('words.result.none')}</p>;
};

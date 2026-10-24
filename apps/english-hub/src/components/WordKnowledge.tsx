import { useI18n, useT } from '../i18n';
import './wordReview.css';

export type WordKnowledgeInput = {
  collocations?: string[] | null;
  word_family?: Array<{ word: string; part_of_speech: string | null }> | null;
  contexts?: Array<{ text: string; source: string | null }> | null;
  translation_ru?: string | null;
  translation_uz?: string | null;
};

/** The translation in the learner's interface language (none in English). */
export const WordTranslation = ({ word }: { word: WordKnowledgeInput }) => {
  const { locale } = useI18n();
  const text = locale === 'ru' ? word.translation_ru : locale === 'uz' ? word.translation_uz : null;
  return text ? <p className="wk-translation" lang={locale}>{text}</p> : null;
};

/**
 * What a learner knows about a word beyond its meaning: the words it goes
 * with, its family, and the sentences where they met it in their own reading
 * and listening. Renders nothing when there is nothing to show.
 */
export const WordKnowledge = ({ word, compact = false }: { word: WordKnowledgeInput; compact?: boolean }) => {
  const t = useT();
  const collocations = word.collocations ?? [];
  const family = word.word_family ?? [];
  const contexts = (word.contexts ?? []).slice(0, compact ? 1 : 3);
  if (!collocations.length && !family.length && !contexts.length) return null;
  return (
    <div className="wk">
      {collocations.length ? (
        <div className="wk-group">
          <p className="wk-label">{t('depth.word.collocations')}</p>
          <ul className="wk-chips" lang="en">
            {collocations.map((phrase) => <li key={phrase}>{phrase}</li>)}
          </ul>
        </div>
      ) : null}
      {family.length ? (
        <div className="wk-group">
          <p className="wk-label">{t('depth.word.family')}</p>
          <ul className="wk-chips is-family" lang="en">
            {family.map((member) => (
              <li key={member.word}>
                {member.word}
                {member.part_of_speech ? <small> · {member.part_of_speech}</small> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {contexts.length ? (
        <div className="wk-group">
          <p className="wk-label">{t('depth.word.metIn')}</p>
          <ul className="wk-contexts">
            {contexts.map((entry) => (
              <li key={entry.text}>
                <span lang="en">“{entry.text}”</span>
                {entry.source ? <small> · {entry.source}</small> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
};

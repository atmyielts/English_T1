import { useT } from '../../i18n';
import { L1Why } from '../../components/L1Why';
import { Panel } from '../../ui/kit';
import { usesWord } from '../../../../../supabase/functions/_shared/english-words.ts';
import type { PersonalResult, PersonalTargets } from './api';
import '../../depth.css';

/** Before starting: the learner's own words to bring in and mistakes to avoid. */
export const PersonalTargetsPanel = ({ personal }: { personal: PersonalTargets | null | undefined }) => {
  const t = useT();
  if (!personal || (!personal.words.length && !personal.watch.length)) return null;
  return (
    <Panel title={t('depth.personal.title')} tone="teal">
      {personal.words.length ? (
        <div className="en-stack" style={{ gap: '.35rem' }}>
          <strong style={{ fontSize: '.9rem' }}>{t('depth.personal.words')}</strong>
          <ul className="dp-chips" lang="en">
            {personal.words.map((word) => (
              <li key={word.id} className="en-tag" title={word.definition ?? undefined}>
                {word.word}{word.definition ? <span className="visually-hidden">: {word.definition}</span> : null}
              </li>
            ))}
          </ul>
          <p className="hint" style={{ margin: 0 }}>{t('depth.personal.wordsHint')}</p>
        </div>
      ) : null}
      {personal.watch.length ? (
        <div className="en-stack" style={{ gap: '.35rem' }}>
          <strong style={{ fontSize: '.9rem' }}>{t('depth.personal.watch')}</strong>
          <ul className="en-list">
            {personal.watch.map((item) => (
              <li key={item.id} className="en-stack" style={{ gap: '.2rem' }}>
                <span className="en-diff" lang="en"><del>{item.wrong}</del> → <ins>{item.right}</ins></span>
                <L1Why original={item.wrong} corrected={item.right} topic={item.topic} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Panel>
  );
};

/** Under a reply box: which of the learner's words the answer already uses. */
export const WordsInText = ({ words, text }: { words: PersonalTargets['words']; text: string }) => {
  const t = useT();
  if (!words.length) return null;
  const used = words.filter((word) => usesWord(text, word.word));
  return (
    <p className="hint dp-words-live" style={{ margin: 0 }}>
      {t('depth.personal.usedLive', { done: used.length, total: words.length })}{' '}
      <span lang="en">
        {words.map((word, index) => (
          <span key={word.id} className={used.includes(word) ? 'is-used' : ''}>
            {index ? ', ' : ''}{used.includes(word) ? `✓ ${word.word}` : word.word}
          </span>
        ))}
      </span>
    </p>
  );
};

/** After checking: words used and whether each watched mistake came back. */
export const PersonalSummary = ({ personal }: { personal: PersonalResult | null | undefined }) => {
  const t = useT();
  if (!personal || (!personal.words_suggested && !personal.watch.length)) return null;
  return (
    <div className="en-stack dp-personal-result" style={{ gap: '.4rem' }}>
      <h3 style={{ margin: 0, fontSize: '.95rem' }}>{t('depth.personal.resultTitle')}</h3>
      {personal.words_suggested ? (
        <p className={personal.words_used.length ? 'en-notice' : 'hint'} style={{ margin: 0 }}>
          {personal.words_used.length
            ? t('depth.personal.wordsUsed', { count: personal.words_used.length, total: personal.words_suggested, words: personal.words_used.join(', ') })
            : t('depth.personal.wordsNone')}
        </p>
      ) : null}
      {personal.watch.map((item) => (
        <p key={item.id} className={item.result === 'repeated' ? 'en-explain' : 'hint'} style={{ margin: 0 }}>
          <span lang="en">“{item.wrong}”</span>:{' '}
          {item.result === 'repeated'
            ? t('depth.personal.repeated', { right: item.right })
            : item.result === 'avoided' ? t('depth.personal.avoided') : t('depth.personal.notSeen')}
        </p>
      ))}
    </div>
  );
};

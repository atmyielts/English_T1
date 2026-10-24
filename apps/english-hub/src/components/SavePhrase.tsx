import { useState } from 'react';
import { useT } from '../i18n';
import { saveWords } from '../lib/notebook';

/**
 * "Save to my words" for a useful phrase from feedback. The phrase goes to
 * the notebook like a tapped word, so it comes back in Review.
 */
export const SavePhrase = ({
  phrase,
  context,
  source,
  label,
  refId,
}: {
  phrase: string;
  context?: string | null;
  source: 'writing-feedback' | 'speaking-feedback' | 'immersion-feedback';
  label?: string | null;
  refId?: string | null;
}) => {
  const t = useT();
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const clean = phrase.trim();
  if (!clean) return null;
  const save = async () => {
    setState('saving');
    try {
      await saveWords([{ word: clean, context_text: context ?? null, source_type: source, source_label: label ?? null, source_ref: refId ?? null }]);
      setState('saved');
    } catch {
      setState('error');
    }
  };
  if (state === 'saved') return <span className="dp-saved" role="status">✓ {t('depth.phrase.saved')}</span>;
  return (
    <button type="button" className="is-link dp-save" disabled={state === 'saving'} onClick={() => void save()} aria-label={t('depth.phrase.saveLabel', { phrase: clean })}>
      {state === 'error' ? t('depth.phrase.retry') : state === 'saving' ? t('depth.phrase.saving') : `+ ${t('depth.phrase.save')}`}
    </button>
  );
};

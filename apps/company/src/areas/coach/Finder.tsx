// Phrase finder (/w/:org/coach/finder): "How do I say this at work?" The person types in
// any of the three languages and gets workplace English to use and to save. When the AI cannot
// answer, the text stays and the phrasebook still offers what it has.
import React, { useState, type FormEvent } from 'react';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../../api.ts';
import { useAppT, useErrorText, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { useWorkspace } from '../../session.tsx';
import { ListenButton, readLocal, useLoad, writeLocal } from '../training/lib.tsx';
import { Gate, PrivacyNote, SaveButton, useTranslated, type Phrase } from './lib.tsx';

interface Option { english: string; note: string; back: string }
interface Reply { status: 'ok' | 'person_limit' | 'ai_limit' | 'ai_unavailable' | 'no_options'; matches: Phrase[]; used: number; limit: number; options?: Option[]; locale?: 'en' | 'ru' | 'uz' }
const TONES = ['neutral', 'formal', 'friendly'] as const;

export function Finder() {
  const t = useAppT(), problem = useErrorText(), translated = useTranslated();
  const { locale } = useI18n();
  const { org } = useWorkspace();
  const { data, error, cause } = useLoad<{ used: number; limit: number; situations: string[] }>(`orgs/${org.id}/coach/finder`);
  const [draft, setDraft] = useState(() => readLocal('coach.finder', ''));
  const [situation, setSituation] = useState('any'), [tone, setTone] = useState<(typeof TONES)[number]>('neutral');
  const [reply, setReply] = useState<Reply | null>(null), [busy, setBusy] = useState(false), [failure, setFailure] = useState('');
  if (!data) return <Gate error={error} cause={cause}/>;
  const used = reply?.used ?? data.used, limit = reply?.limit ?? data.limit;

  async function find(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setFailure(''); setReply(null);
    try {
      setReply(await api<Reply>(`orgs/${org.id}/coach/finder`, { method: 'POST', body: { text: draft, situation, tone, locale }, timeoutMs: 60000 }));
    } catch (failed) {
      setFailure(problem(failed));
    } finally {
      setBusy(false);
    }
  }

  return <div className="coach-page">
    <header className="coach-head">
      <h1>{t('coach.finder.title')}</h1>
      <p>{t('coach.finder.lead')}</p>
    </header>
    <section className="coach-card" aria-label={t('coach.finder.title')}>
      <form className="coach-form" onSubmit={(event) => void find(event)}>
        <label>{t('coach.finder.text')}
          <textarea rows={3} required minLength={2} maxLength={400} value={draft} placeholder={t('coach.finder.placeholder')}
            onChange={(event) => { setDraft(event.target.value); writeLocal('coach.finder', event.target.value || null); }}/>
        </label>
        <div className="coach-form-row">
          <label>{t('coach.finder.situation')}
            <select value={situation} onChange={(event) => setSituation(event.target.value)}>
              <option value="any">{t('coach.finder.anySituation')}</option>
              {data.situations.map((code) => <option key={code} value={code}>{t(`coach.situation.${code}` as AppKey)}</option>)}
            </select>
          </label>
          <label>{t('coach.finder.tone')}
            <select value={tone} onChange={(event) => setTone(event.target.value as typeof tone)}>
              {TONES.map((code) => <option key={code} value={code}>{t(`coach.tone.${code}` as AppKey)}</option>)}
            </select>
          </label>
        </div>
        <p className="company-actions">
          <button type="submit" disabled={busy}>{busy ? t('coach.finder.finding') : t('coach.finder.find')}</button>
          <span className="coach-note">{t('coach.finder.left', { left: Math.max(0, limit - used), limit })}</span>
        </p>
      </form>
      {failure && <p className="error" role="alert">{failure}</p>}
      {reply && reply.status !== 'ok' && <p className={reply.status === 'no_options' ? '' : 'error'} role="alert">{t(`coach.finder.status.${reply.status}` as AppKey, { limit })}</p>}
    </section>

    {reply?.options && <section className="coach-card" aria-labelledby="coach-options" aria-live="polite">
      <h2 id="coach-options">{t('coach.finder.options')}</h2>
      <ul className="coach-options">
        {reply.options.map((option) => <li key={option.english}>
          <p className="coach-phrase-en" lang="en">{option.english}</p>
          {option.back && <p className="coach-meaning">{option.back}</p>}
          {option.note && <p className="coach-note">{option.note}</p>}
          <p className="company-actions">
            <ListenButton text={option.english}/>
            <SaveButton body={{ front: option.english, source: 'finder', note: option.note, ...(reply.locale === 'ru' ? { ru: option.back } : reply.locale === 'uz' ? { uz: option.back } : {}) }}/>
          </p>
        </li>)}
      </ul>
      <p className="coach-note">{t('coach.finder.aiLabel')}</p>
    </section>}

    {reply && reply.matches.length > 0 && <section className="coach-card" aria-labelledby="coach-matches">
      <h2 id="coach-matches">{t('coach.finder.matches')}</h2>
      <ul className="coach-options">
        {reply.matches.map((phrase) => <li key={phrase.id}>
          <p className="coach-phrase-en" lang="en">{phrase.en}</p>
          <p className="coach-meaning">{translated(phrase)}</p>
          <p className="company-actions"><ListenButton text={phrase.en}/><SaveButton phrase={phrase.id}/></p>
        </li>)}
      </ul>
      <p><Link to={`/w/${org.id}/coach/phrasebook`}>{t('coach.nav.phrasebook')}</Link></p>
    </section>}
    <p className="coach-note">{t('coach.finder.privacy')}</p>
    <PrivacyNote/>
  </div>;
}

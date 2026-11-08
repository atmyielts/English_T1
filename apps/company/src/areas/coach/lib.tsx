// Coach area: API shapes and the small pieces its pages share. Listening, speech,
// loading and the seat notice come from the training area, so they stay the same app-wide.
import React, { useState } from 'react';
import { useI18n } from '../../../../../packages/service-i18n/src/i18n.tsx';
import { api } from '../../api.ts';
import { useAppT, useErrorText } from '../../i18n/index.ts';
import { useWorkspace } from '../../session.tsx';
import { Loading, needsSeat, SeatLocked, seatReasonOf, type Localized } from '../training/lib.tsx';

export type CardSource = 'lesson' | 'glossary' | 'phrasebook' | 'finder' | 'own';
export type ReviewMode = 'intro' | 'listen' | 'recall' | 'type';
export interface Card {
  id: string; source: CardSource; source_ref: string | null; front: string; ru: string | null; uz: string | null; note: string | null;
  state: 'new' | 'learning' | 'review'; stability: number; reps: number; lapses: number; due_on: string | null; last_reviewed_at: string | null; suspended: boolean; mode: ReviewMode;
}
export interface Phrase { id: string; situation: string; en: string; ru: string; uz: string; level: 'a2' | 'b1' | 'b2'; tone: 'formal' | 'neutral' | 'friendly' }
export interface DialogueLine { who: 'a' | 'b'; en: string; ru: string; uz: string }
export interface Dialogue { situation: string; title: Localized; a: Localized; b: Localized; lines: DialogueLine[] }
export interface Situation { code: string; title: Localized; lead: Localized; phrases: Phrase[]; dialogue: Dialogue | null }

/** Page state for a load that may be refused for lack of a seat. */
export function Gate({ error, cause }: { error: string; cause: unknown }) {
  return needsSeat(cause) ? <SeatLocked browse reason={seatReasonOf(cause)}/> : <Loading error={error}/>;
}

/** A translation in the reader's language, falling back to the other one. */
export function useTranslated() {
  const { locale } = useI18n();
  return (entry: { ru: string | null; uz: string | null }) => (locale === 'uz' ? entry.uz ?? entry.ru : entry.ru ?? entry.uz) ?? '';
}

/** Saves a phrase to the deck: one click, harmless if repeated, and the button says what happened. */
export function SaveButton({ phrase, body, saved = false, onSaved }: { phrase?: string; body?: Record<string, unknown>; saved?: boolean; onSaved?: () => void }) {
  const t = useAppT(), problem = useErrorText();
  const { org } = useWorkspace();
  const [done, setDone] = useState(saved), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function save() {
    setBusy(true); setError('');
    try {
      await api(`orgs/${org.id}/coach/cards`, { method: 'POST', body: phrase ? { phrase } : body });
      setDone(true);
      onSaved?.();
    } catch (cause) {
      setError(problem(cause));
    } finally {
      setBusy(false);
    }
  }
  return <>
    <button type="button" className="quiet coach-save" disabled={done || busy} onClick={() => void save()}>{done ? t('coach.save.done') : t('coach.save.action')}</button>
    {error && <span className="error" role="alert">{error}</span>}
  </>;
}

/** What the deck and practice share with the company, said the same way on every page. */
export function PrivacyNote() {
  const t = useAppT();
  return <p className="coach-note">{t('coach.privacy')}</p>;
}

export function Meter({ value, total, label }: { value: number; total: number; label: string }) {
  const percent = total > 0 ? Math.round(Math.min(1, value / total) * 100) : 0;
  return <div className="coach-meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(value, total)} aria-valuetext={`${value} / ${total}`}>
    <span style={{ width: `${percent}%` }}/>
  </div>;
}

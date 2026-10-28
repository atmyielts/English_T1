// TOEFL 2026 unit rendering for shared screens that are not the 2026 runner:
// the admin builder preview, the legacy ExamPlayer and the review page.
import React from 'react';
import { BuildSentence, CompleteWords, DailyText, DiscussionTask, EmailTask } from './renderers';
import { isRecord, TASK_TYPE_DISCUSSION, TASK_TYPE_EMAIL } from './tasks';
import './toefl2026.css';

type Json = Record<string, unknown>;
type UnitLike = { type: string; data: unknown };

const noop = () => undefined;

export const renderToefl2026Unit = (
  unit: UnitLike,
  value: unknown,
  onChange: ((value: unknown) => void) | undefined,
  readOnly: boolean | undefined,
): React.ReactElement | null => {
  const data = (isRecord(unit.data) ? unit.data : {}) as Json;
  const change = onChange ?? noop;
  if (unit.type === 'question_complete_words') return <CompleteWords data={data} value={value} readOnly={readOnly || !onChange} onChange={change} />;
  if (unit.type === 'question_build_sentence') return <BuildSentence data={data} value={value} readOnly={readOnly || !onChange} onChange={change} />;
  if (unit.type === 'reading_passage' && data.toefl_stimulus === 'daily_life') return <DailyText data={data} />;
  if (unit.type === 'question_text' && data.task_type === TASK_TYPE_EMAIL) return <EmailTask data={data} value={value} readOnly={readOnly || !onChange} onChange={change} />;
  if (unit.type === 'question_text' && data.task_type === TASK_TYPE_DISCUSSION) return <DiscussionTask data={data} value={value} readOnly={readOnly || !onChange} onChange={change} />;
  if (unit.type === 'question_speaking_repeat' || unit.type === 'question_speaking_interview') {
    const audio = isRecord(data.audio) ? data.audio : {};
    const transcript = isRecord(value) ? String(value.transcript ?? '') : '';
    return (
      <div className="t26-card" data-testid="speaking-preview">
        <p className="t26-strong">{unit.type === 'question_speaking_repeat' ? 'Listen and Repeat' : 'Take an Interview'} {String(data.index ?? '')}/{String(data.of ?? '')}</p>
        <p className="t26-muted t26-break">{String(data.scenario ?? '')}</p>
        {typeof audio.url === 'string' ? <audio controls preload="none" src={audio.url} style={{ maxWidth: '100%' }} /> : null}
        {value != null ? <p className="t26-break">Transcript: {transcript || '(nothing recognised)'}</p> : null}
      </div>
    );
  }
  return null;
};

/** Human-readable answer key for the review page. */
export const toefl2026CorrectSummary = (type: string, correct: unknown): string | null => {
  if (!isRecord(correct)) return null;
  if (type === 'question_complete_words' && isRecord(correct.words)) return Object.values(correct.words).map(String).join(', ');
  if (type === 'question_build_sentence' && typeof correct.sentence === 'string') return correct.sentence;
  if (type === 'question_speaking_repeat' && typeof correct.text === 'string') return correct.text;
  if (type === 'question_speaking_interview' && typeof correct.question_text === 'string') return correct.question_text;
  if (type === 'audio' && Array.isArray(correct.transcript)) {
    return (correct.transcript as unknown[]).filter(isRecord).map((l) => `${String(l.speaker ?? '')}: ${String(l.text ?? '')}`).join('\n');
  }
  return null;
};

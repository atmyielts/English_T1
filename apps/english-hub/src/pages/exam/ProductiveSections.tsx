import { useEffect, useRef, useState } from 'react';
import { formatClock, SpeakOrType } from '../../components/SpeakOrType';
import { useT } from '../../i18n';
import { type SpeakingView, type WritingView, wordCount } from '../../lib/exam';
import { canSpeak, speak, stopSpeaking } from '../../lib/speech';
import { Panel } from '../../ui/kit';

export type WritingDraft = { task11: string; task12: string; part2: string };
export type SpeakingDraft = Array<{ text: string; seconds: number }>;

const TARGETS = { task11: { min: 40, max: 70 }, task12: { min: 120, max: 150 }, part2: { min: 180, max: 200 } } as const;

const WordCounter = ({ text, task }: { text: string; task: keyof typeof TARGETS }) => {
  const t = useT();
  const count = wordCount(text);
  const target = TARGETS[task];
  return <span className={`en-exam-count ${count >= target.min && count <= target.max ? 'is-ok' : ''}`.trim()} aria-live="polite">{t('exam.writing.words', { count })}</span>;
};

/** The writing section: the input email, two emails (informal, formal) and an online post. */
export const WritingSection = ({ content, draft, onChange, disabled }: { content: WritingView; draft: WritingDraft; onChange: (task: keyof WritingDraft, text: string) => void; disabled: boolean }) => {
  const t = useT();
  const box = (task: keyof WritingDraft, rows: number) => (
    <div className="en-stack" style={{ gap: '.35rem' }}>
      <textarea
        id={`ex-w-${task}`}
        aria-label={t(`exam.writing.${task}.label`)}
        rows={rows}
        maxLength={task === 'task11' ? 1500 : task === 'task12' ? 3000 : 4000}
        value={draft[task]}
        disabled={disabled}
        onChange={(event) => onChange(task, event.target.value)}
        lang="en"
        spellCheck={false}
      />
      <WordCounter text={draft[task]} task={task} />
    </div>
  );
  return (
    <>
      <Panel title={t('exam.writing.part1')}>
        <div className="en-stack">
          <div className="en-exam-email" lang="en">
            <small>{t('exam.writing.from')}: {content.input.from}</small>
            <small>{t('exam.writing.subject')}: {content.input.subject}</small>
            <p>{content.input.body}</p>
          </div>
          <div className="en-stack" style={{ gap: '.4rem' }}>
            <h3 style={{ margin: 0, fontSize: '.95rem' }}>{t('exam.writing.task11.label')}</h3>
            <p lang="en" style={{ margin: 0 }}>{content.task11}</p>
            {box('task11', 4)}
          </div>
          <div className="en-stack" style={{ gap: '.4rem' }}>
            <h3 style={{ margin: 0, fontSize: '.95rem' }}>{t('exam.writing.task12.label')}</h3>
            <p lang="en" style={{ margin: 0 }}>{content.task12}</p>
            {box('task12', 9)}
          </div>
        </div>
      </Panel>
      <Panel title={t('exam.writing.part2.label')}>
        <div className="en-stack" style={{ gap: '.4rem' }}>
          <p lang="en" style={{ margin: 0 }}>{content.part2}</p>
          {box('part2', 12)}
        </div>
      </Panel>
    </>
  );
};

type SpeakingStep = { number: number; part: '1.1' | '1.2' | '2' | '3'; question: string; talk: number; prep: number };

const stepsOf = (content: SpeakingView, talk: number[], prep: number[]): SpeakingStep[] => [
  ...content.part11.map((question, index) => ({ number: index + 1, part: '1.1' as const, question, talk: talk[index] ?? 30, prep: prep[index] ?? 0 })),
  ...content.part12.questions.map((question, index) => ({ number: index + 4, part: '1.2' as const, question, talk: talk[index + 3] ?? 30, prep: prep[index + 3] ?? 0 })),
  { number: 7, part: '2' as const, question: content.part2.questions.join(' '), talk: talk[6] ?? 120, prep: prep[6] ?? 60 },
  { number: 8, part: '3' as const, question: content.part3.statement, talk: talk[7] ?? 120, prep: prep[7] ?? 60 },
];

/** The speaking section: eight questions with the official answer and preparation times. */
export const SpeakingSection = ({ content, draft, onChange, talkSeconds, prepSeconds, disabled, onFinished }: {
  content: SpeakingView;
  draft: SpeakingDraft;
  onChange: (index: number, patch: Partial<{ text: string; seconds: number }>) => void;
  talkSeconds: number[];
  prepSeconds: number[];
  disabled: boolean;
  onFinished: () => void;
}) => {
  const t = useT();
  const steps = stepsOf(content, talkSeconds, prepSeconds);
  const [position, setPosition] = useState(0);
  const step = steps[position]!;
  const answer = draft[position] ?? { text: '', seconds: 0 };
  const [prepLeft, setPrepLeft] = useState(step.prep);
  const [talking, setTalking] = useState(step.prep === 0);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => () => stopSpeaking(), []);

  // Each question is read out and focused, as the examiner would ask it.
  useEffect(() => {
    setPrepLeft(step.prep);
    setTalking(step.prep === 0 || (draft[position]?.text ?? '') !== '');
    headingRef.current?.focus();
    if (canSpeak()) void speak(step.part === '3' ? content.part3.statement : step.question, { rate: 0.95 });
    // Once per question.
  }, [position]);

  useEffect(() => {
    if (talking || step.prep === 0) return;
    if (prepLeft <= 0) {
      setTalking(true);
      return;
    }
    const timer = window.setTimeout(() => setPrepLeft((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [talking, prepLeft, step.prep]);

  const partLabel = t(`exam.speaking.part.${step.part.replace('.', '_')}`);
  const isLast = position === steps.length - 1;

  return (
    <Panel title={partLabel}>
      <div className="en-stack">
        <p className="hint" style={{ margin: 0 }}>{t('exam.speaking.questionOf', { current: step.number, total: steps.length })}</p>
        {step.part === '1.2' ? <div className="en-exam-scene"><p><strong>{t('exam.speaking.scene')}</strong> <span lang="en">{content.part12.scene}</span></p></div> : null}
        {step.part === '2' ? (
          <div className="en-exam-scene">
            <p><strong>{t('exam.speaking.scene')}</strong> <span lang="en">{content.part2.scene}</span></p>
            <ul lang="en" style={{ margin: '.4rem 0 0', paddingLeft: '1.1rem' }}>{content.part2.questions.map((question) => <li key={question}>{question}</li>)}</ul>
          </div>
        ) : null}
        <h2 ref={headingRef} tabIndex={-1} className="en-mock-question" lang="en">{step.part === '2' ? t('exam.speaking.part2Ask') : step.question}</h2>
        {step.part === '3' ? (
          <div className="en-exam-sides" lang="en">
            <div><strong>{t('exam.speaking.for')}</strong><ul>{content.part3.for.map((point) => <li key={point}>{point}</li>)}</ul></div>
            <div><strong>{t('exam.speaking.against')}</strong><ul>{content.part3.against.map((point) => <li key={point}>{point}</li>)}</ul></div>
          </div>
        ) : null}
        {step.part === '3' ? <p className="hint" style={{ margin: 0 }}>{t('exam.speaking.part3Hint')}</p> : null}

        {!talking ? (
          <div className="en-stack">
            <p className="en-speak-timer" role="timer" aria-live="off">{t('exam.speaking.prep', { time: formatClock(prepLeft) })}</p>
            <div className="en-actions"><button type="button" onClick={() => setTalking(true)}>{t('exam.speaking.startNow')}</button></div>
          </div>
        ) : (
          <>
            <p className="hint" style={{ margin: 0 }}>{t('exam.speaking.talkFor', { time: formatClock(step.talk) })}</p>
            <SpeakOrType
              key={position}
              id={`ex-s-${position}`}
              label={t('speak.label')}
              value={answer.text}
              onChange={(text) => onChange(position, { text })}
              onSeconds={(seconds) => onChange(position, { seconds })}
              spokenSeconds={answer.seconds}
              maxSeconds={step.talk}
              rows={step.talk >= 120 ? 6 : 3}
              autoStart={step.prep > 0 && answer.seconds === 0 && !answer.text}
              disabled={disabled}
            />
          </>
        )}

        <div className="en-actions">
          {position > 0 ? <button type="button" className="quiet" disabled={disabled} onClick={() => { stopSpeaking(); setPosition(position - 1); }}>{t('exam.back')}</button> : null}
          {isLast
            ? <button type="button" disabled={disabled} onClick={() => { stopSpeaking(); onFinished(); }}>{t('exam.submitSection')}</button>
            : <button type="button" disabled={disabled || !talking} onClick={() => { stopSpeaking(); setPosition(position + 1); }}>{t('exam.next')}</button>}
        </div>
      </div>
    </Panel>
  );
};

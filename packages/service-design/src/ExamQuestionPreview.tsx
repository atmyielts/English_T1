import { useId, useState, type ReactNode } from 'react';
import './exam-preview.css';

type Props = {
  label: string;
  title: string;
  prompt: ReactNode;
  detail?: ReactNode;
  choices: readonly string[];
  answer: number;
  feedback: { correct: string; retry: string };
};

export function ExamQuestionPreview({ label, title, prompt, detail, choices, answer, feedback }: Props) {
  const titleId = useId();
  const [selected, setSelected] = useState<number | null>(null);
  const correct = selected === answer;

  return (
    <section className="exam-question-preview" aria-labelledby={titleId}>
      <div className="exam-preview-bar">
        <span>{label}</span>
        <span className="exam-preview-mode">{title}</span>
      </div>
      <div className="exam-preview-body">
        {detail ? <div className="exam-preview-detail" lang="en">{detail}</div> : null}
        <h2 id={titleId} className="exam-preview-prompt" lang="en">{prompt}</h2>
        <div className="exam-preview-answers">
          {choices.map((choice, index) => (
            <button type="button" key={choice} aria-pressed={selected === index} lang="en"
              onClick={() => setSelected(index)}
              data-result={selected !== index ? undefined : correct ? 'correct' : 'retry'}>
              {choice}
            </button>
          ))}
        </div>
        <p className="exam-preview-feedback" aria-live="polite">
          {selected == null ? '' : correct ? feedback.correct : feedback.retry}
        </p>
      </div>
    </section>
  );
}

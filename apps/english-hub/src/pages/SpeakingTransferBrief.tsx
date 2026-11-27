import { useState } from 'react';
import { useT } from '../i18n';
import type { TransferTask } from '../lib/transfer';
import { useSpeakingCapture } from '../skills/speaking/capture';
import { Panel } from '../ui/kit';

export const SpeakingTransferBrief = ({ task, onSubmit, busy }: {
  task: TransferTask;
  onSubmit: (responses: string[]) => void;
  busy: boolean;
}) => {
  const t = useT();
  const capture = useSpeakingCapture(40);
  const [responses, setResponses] = useState<string[]>([]);
  const position = responses.length;
  const question = task.prompts[position];
  const recording = capture.phase === 'recording' || capture.phase === 'finishing';
  const ready = capture.phase === 'done' && !capture.problem && capture.transcript.trim().length >= 4
    && capture.transcript.length <= 400;
  const reset = () => {
    capture.reset();
    setResponses([]);
  };

  if (!capture.supported) {
    return (
      <Panel title={<span lang="en">{task.title}</span>}>
        <p lang="en">{task.brief}</p>
        <p className="hint">{t('transfer.speech.captureProblem')}</p>
        {task.prompts.map((prompt) => (
          <label className="mastery-answer mastery-question" key={prompt}>
            <strong lang="en">{prompt}</strong>
            <span>{t('transfer.speech.rehearsal')}</span>
            <textarea rows={2} lang="en" maxLength={400} />
          </label>
        ))}
      </Panel>
    );
  }

  return (
    <Panel title={<span lang="en">{task.title}</span>}>
      <p lang="en">{task.brief}</p>
      <p className="hint">{t('transfer.speech.scope')}</p>
      {responses.length > 0 ? (
        <ol className="mastery-feedback">
          {responses.map((response, index) => <li key={task.prompts[index]} lang="en">{response}</li>)}
        </ol>
      ) : null}
      {question ? (
        <>
          <p><strong lang="en">{question}</strong></p>
          {capture.problem ? <p role="status">{t('transfer.speech.captureProblem')}</p> : null}
          {capture.transcript ? <p aria-live="polite"><q lang="en">{capture.transcript}</q></p> : null}
          {capture.audioUrl ? <audio controls src={capture.audioUrl} aria-label={t('transfer.speech.replay')} /> : null}
          <div className="en-actions">
            {capture.phase === 'recording' ? (
              <button className="en-button" type="button" onClick={capture.stop}>{t('transfer.speech.stop')}</button>
            ) : (
              <button className="en-button-quiet" type="button" disabled={recording || busy} onClick={() => void capture.start()}>
                {t(capture.phase === 'done' ? 'transfer.speech.retry' : 'transfer.speech.record')}
              </button>
            )}
            <button
              className="en-button" type="button" disabled={!ready || busy}
              onClick={() => {
                setResponses((saved) => [...saved, capture.transcript.trim()]);
                capture.reset();
              }}
            >{t('transfer.speech.confirm')}</button>
          </div>
          {capture.problem ? (
            <label className="mastery-answer">
              <span>{t('transfer.speech.rehearsal')}</span>
              <textarea rows={2} lang="en" maxLength={400} />
            </label>
          ) : null}
        </>
      ) : (
        <div className="en-actions">
          <button className="en-button" type="button" disabled={busy} onClick={() => onSubmit(responses)}>
            {t(busy ? 'common.loading' : 'transfer.speech.submit')}
          </button>
          <button className="en-button-quiet" type="button" disabled={busy} onClick={reset}>{t('transfer.speech.restart')}</button>
        </div>
      )}
    </Panel>
  );
};

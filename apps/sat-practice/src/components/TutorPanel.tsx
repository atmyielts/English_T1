import { useState } from 'react';
import { Bot, Lightbulb, WandSparkles } from 'lucide-react';
import type { Json, TutorResponse } from '../lib/api';

type TutorMode = 'explain' | 'simpler' | 'similar' | 'why-wrong';

const modeLabels: Record<TutorMode, string> = {
  explain: 'Explain',
  simpler: 'Simpler',
  similar: 'Similar',
  'why-wrong': 'Why wrong',
};

export const TutorPanel = (props: {
  questionId: string;
  load: (mode: TutorMode) => Promise<TutorResponse>;
}) => {
  const [mode, setMode] = useState<TutorMode>('explain');
  const [result, setResult] = useState<TutorResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (nextMode: TutorMode) => {
    setMode(nextMode);
    setLoading(true);
    try {
      setResult(await props.load(nextMode));
    } finally {
      setLoading(false);
    }
  };

  const data = result?.data as Json | undefined;

  return (
    <section className="panel tutor-panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">AI Tutor</p>
          <h2>Question repair</h2>
        </div>
        <Bot size={22} />
      </div>
      <div className="tab-row">
        {(Object.keys(modeLabels) as TutorMode[]).map((entry) => (
          <button
            key={entry}
            type="button"
            className={`tab${mode === entry ? ' active' : ''}`}
            onClick={() => void run(entry)}
          >
            {modeLabels[entry]}
          </button>
        ))}
      </div>
      {!result && !loading ? (
        <button type="button" className="btn solid" onClick={() => void run('explain')}>
          <Lightbulb size={17} />
          Generate explanation
        </button>
      ) : null}
      {loading ? <div className="empty-state">Thinking through the question...</div> : null}
      {result ? (
        <div className={`ai-card ${result.ai_status}`}>
          <div className="chip-row">
            <span className="chip neutral">{result.ai_status}</span>
            <span className="chip neutral">{props.questionId.slice(0, 8)}</span>
          </div>
          <pre>{JSON.stringify(data ?? {}, null, 2)}</pre>
          {result.error ? <p className="error-text">{result.error}</p> : null}
          <WandSparkles size={18} />
        </div>
      ) : null}
    </section>
  );
};

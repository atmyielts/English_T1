import { Fragment, useMemo, useState } from 'react';
import { PenLine, Sparkles } from 'lucide-react';
import { practiceWritingAnnotate, type AnnotatedWritingTask, type WritingAnnotation } from '../lib/api';

const CRITERION_TONES: Record<string, string> = {
  TR: '#1e40af',
  TA: '#1e40af',
  CC: '#0e4955',
  LR: '#8a5a1b',
  GRA: '#9b2c2c',
};

const SEVERITY_INTENSITY: Record<WritingAnnotation['severity'], number> = {
  low: 12,
  medium: 22,
  high: 36,
};

interface Span {
  text: string;
  annotation?: WritingAnnotation;
}

// Anchor each AI annotation phrase in the student's text and split the
// answer into spans so we can render highlighted segments inline.
const sliceWithAnnotations = (text: string, annotations: WritingAnnotation[]): Span[] => {
  if (annotations.length === 0) return [{ text }];

  // Map of [startIndex, endIndex] -> annotation. Resolve overlaps by
  // preferring the first match for each annotation.
  const ranges: Array<{ start: number; end: number; annotation: WritingAnnotation }> = [];
  for (const ann of annotations) {
    const phrase = ann.phrase.trim();
    if (!phrase) continue;
    // Case-insensitive search; fall back to lowercase match
    const lowerText = text.toLowerCase();
    const lowerPhrase = phrase.toLowerCase();
    const start = lowerText.indexOf(lowerPhrase);
    if (start === -1) continue;
    const end = start + phrase.length;
    // Avoid overlapping previous ranges
    if (ranges.some((r) => start < r.end && end > r.start)) continue;
    ranges.push({ start, end, annotation: ann });
  }
  ranges.sort((a, b) => a.start - b.start);

  const spans: Span[] = [];
  let cursor = 0;
  for (const r of ranges) {
    if (r.start > cursor) spans.push({ text: text.slice(cursor, r.start) });
    spans.push({ text: text.slice(r.start, r.end), annotation: r.annotation });
    cursor = r.end;
  }
  if (cursor < text.length) spans.push({ text: text.slice(cursor) });
  return spans;
};

interface Props {
  accessToken: string | null;
  practiceSessionId: string;
}

export const AnnotatedWritingRetro = ({ accessToken, practiceSessionId }: Props) => {
  const [tasks, setTasks] = useState<AnnotatedWritingTask[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openCommentId, setOpenCommentId] = useState<string | null>(null);

  const request = async () => {
    if (!accessToken || !practiceSessionId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await practiceWritingAnnotate(accessToken, practiceSessionId);
      setTasks(res.tasks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not generate annotations');
    } finally {
      setLoading(false);
    }
  };

  const totalAnnotations = useMemo(
    () => (tasks ?? []).reduce((sum, task) => sum + task.annotations.length, 0),
    [tasks],
  );

  return (
    <section className="glass stat-card wide" style={{ padding: 28 }}>
      <div className="task-card-head">
        <div>
          <p className="eyebrow"><PenLine size={11} style={{ verticalAlign: -2, marginRight: 4 }} /> Annotated retro</p>
          <h3 style={{ marginTop: 4 }}>Inline rubric annotations on your response</h3>
          <p className="muted" style={{ margin: '4px 0 0', fontSize: 14 }}>
            See exactly which phrases moved the band — anchored to the criterion (TR / CC / LR / GRA).
            Hover or tap a highlight to read the examiner note.
          </p>
        </div>
        {tasks == null ? (
          <button
            type="button"
            className="btn solid compact"
            onClick={() => void request()}
            disabled={loading || !accessToken}
          >
            {loading ? 'Annotating…' : 'Annotate response'}
          </button>
        ) : null}
      </div>

      {error ? <p className="error-text" style={{ marginTop: 12 }}>{error}</p> : null}

      {tasks != null && tasks.length === 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>No writing responses found for this session.</p>
      ) : null}

      {tasks != null && totalAnnotations === 0 && tasks.length > 0 ? (
        <p className="muted" style={{ marginTop: 12 }}>
          The model didn’t surface any pivotal annotations — try the AI coach above for a higher-level take.
        </p>
      ) : null}

      {tasks != null && tasks.length > 0 ? (
        <div style={{ marginTop: 16, display: 'grid', gap: 18 }}>
          {tasks.map((task, taskIdx) => {
            const spans = sliceWithAnnotations(task.answer_text, task.annotations);
            return (
              <article key={task.task_id} className="feedback-panel">
                <div className="task-card-head" style={{ marginBottom: 10 }}>
                  <h4 style={{ margin: 0 }}>
                    {task.task_type ? task.task_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : `Task ${taskIdx + 1}`}
                  </h4>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {task.annotations.length} annotation{task.annotations.length === 1 ? '' : 's'}
                  </span>
                </div>

                <p style={{ fontSize: 15, lineHeight: 1.75, color: 'var(--ink-2)', whiteSpace: 'pre-wrap', margin: 0 }}>
                  {spans.map((span, i) => {
                    if (!span.annotation) return <Fragment key={i}>{span.text}</Fragment>;
                    const ann = span.annotation;
                    const tone = CRITERION_TONES[ann.criterion] ?? '#0e4955';
                    const intensity = SEVERITY_INTENSITY[ann.severity];
                    const commentKey = `${task.task_id}::${i}`;
                    const open = openCommentId === commentKey;
                    return (
                      <span key={i} style={{ position: 'relative', display: 'inline' }}>
                        <button
                          type="button"
                          onClick={() => setOpenCommentId(open ? null : commentKey)}
                          style={{
                            background: `color-mix(in srgb, ${tone} ${intensity}%, transparent)`,
                            borderBottom: `2px solid ${tone}`,
                            color: 'inherit',
                            padding: '0 2px',
                            margin: 0,
                            border: 'none',
                            borderRadius: 2,
                            cursor: 'pointer',
                            font: 'inherit',
                          }}
                          title={`${ann.criterion} · ${ann.severity}`}
                        >
                          {span.text}
                        </button>
                        {open ? (
                          <span
                            role="dialog"
                            style={{
                              position: 'absolute',
                              top: '100%',
                              left: 0,
                              marginTop: 6,
                              zIndex: 5,
                              minWidth: 240,
                              maxWidth: 360,
                              padding: '10px 12px',
                              background: 'var(--card)',
                              border: `1px solid ${tone}`,
                              borderRadius: 8,
                              boxShadow: 'var(--shadow-md)',
                              fontSize: 13,
                              lineHeight: 1.45,
                              color: 'var(--ink-2)',
                              display: 'block',
                            }}
                          >
                            <strong style={{ color: tone, display: 'block', marginBottom: 4, fontSize: 11, letterSpacing: '0.12em' }}>
                              {ann.criterion} · {ann.severity.toUpperCase()}
                            </strong>
                            {ann.comment}
                          </span>
                        ) : null}
                      </span>
                    );
                  })}
                </p>

                {task.annotations.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 14 }}>
                    {Array.from(new Set(task.annotations.map((a) => a.criterion))).map((criterion) => {
                      const tone = CRITERION_TONES[criterion] ?? '#0e4955';
                      const count = task.annotations.filter((a) => a.criterion === criterion).length;
                      return (
                        <span
                          key={criterion}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: '0.06em',
                            background: `color-mix(in srgb, ${tone} 10%, transparent)`,
                            color: tone,
                            border: `1px solid color-mix(in srgb, ${tone} 25%, transparent)`,
                          }}
                        >
                          <Sparkles size={9} /> {criterion} ×{count}
                        </span>
                      );
                    })}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
};

import { ArrowRight, RefreshCcw } from 'lucide-react';
import type { PlanItem } from '../lib/api';

const taskLabel = (item: PlanItem): string => {
  const domain = String(item.payload.domain ?? 'mixed').replace(/_/g, ' ');
  if (item.task_type === 'notebook_review') return 'Review mistake notebook';
  if (item.task_type === 'half_mock') return 'Half mock checkpoint';
  if (item.task_type === 'tutor_session') return 'Tutor repair session';
  return `Drill ${domain}`;
};

export const DailyPlanCard = (props: {
  items: PlanItem[];
  busy?: boolean;
  onStart: (item: PlanItem) => void;
  onRegenerate: () => void;
}) => (
  <section className="panel daily-plan">
    <div className="section-head">
      <div>
        <p className="eyebrow">Today</p>
        <h2>Your next three moves</h2>
      </div>
      <button type="button" className="icon-button" onClick={props.onRegenerate} disabled={props.busy} title="Regenerate plan">
        <RefreshCcw size={17} />
      </button>
    </div>
    {props.items.length === 0 ? (
      <div className="empty-state">No tasks yet. Regenerate to build today from your latest SAT evidence.</div>
    ) : (
      <ul className="plan-list">
        {props.items.map((item) => (
          <li key={item.id}>
            <div>
              <strong>{taskLabel(item)}</strong>
              <span>{item.estimated_minutes} min · {item.status.replace('_', ' ')}</span>
            </div>
            <button type="button" className="icon-button" onClick={() => props.onStart(item)} title="Start task">
              <ArrowRight size={17} />
            </button>
          </li>
        ))}
      </ul>
    )}
  </section>
);

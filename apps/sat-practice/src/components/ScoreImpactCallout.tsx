import { TrendingUp } from 'lucide-react';

export const ScoreImpactCallout = (props: { conservative: number; optimistic: number; label?: string }) => (
  <section className="score-impact">
    <TrendingUp size={22} />
    <div>
      <p className="eyebrow">Score impact</p>
      <h2>Fixing your top weak areas could add roughly {props.conservative}-{props.optimistic} points.</h2>
      <span>{props.label ?? 'Estimate assumes the weakness is mastered, not merely practiced.'}</span>
    </div>
  </section>
);

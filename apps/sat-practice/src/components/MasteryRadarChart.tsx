import { SAT_DOMAINS, formatSatDomain } from '@schood/sat-core';
import type { MasteryRow } from '../lib/api';

export const MasteryRadarChart = (props: { mastery: MasteryRow[] }) => {
  const byDomain = new Map<string, number>();
  for (const row of props.mastery) {
    const prev = byDomain.get(row.domain) ?? 0;
    byDomain.set(row.domain, Math.max(prev, row.mastery_level));
  }

  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <p className="eyebrow">Mastery</p>
          <h2>Nine-domain map</h2>
        </div>
      </div>
      <div className="mastery-bars">
        {SAT_DOMAINS.map((domain) => {
          const pct = Math.round((byDomain.get(domain) ?? 0) * 100);
          return (
            <div className="mastery-row" key={domain}>
              <div>
                <span>{formatSatDomain(domain)}</span>
                <strong>{pct}%</strong>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

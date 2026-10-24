import React from 'react';
import { useI18n } from '../../../packages/service-i18n/src/i18n.tsx';
import type { LearnerState } from './api.ts';
import { useAppT } from './i18n/index.ts';
import { useDay } from './dates.ts';

const W = 320, H = 96, PAD = { top: 10, right: 40, bottom: 8, left: 4 };

/** Predicted points over time: one line for the likely value, a band for the range. */
export function Trend({ trend, max }: { trend: LearnerState['trend']; max: number }) {
  const t = useAppT(), { number } = useI18n(), fullDay = useDay();
  if (trend.length < 2) return null;
  const x = (index: number) => PAD.left + (index / (trend.length - 1)) * (W - PAD.left - PAD.right);
  const y = (value: number) => PAD.top + (1 - value / max) * (H - PAD.top - PAD.bottom);
  const line = trend.map((row, index) => `${x(index)},${y(row.expected)}`).join(' ');
  const band = [...trend.map((row, index) => `${x(index)},${y(row.high)}`), ...trend.map((row, index) => `${x(trend.length - 1 - index)},${y(trend[trend.length - 1 - index].low)}`)].join(' ');
  const first = trend[0], last = trend[trend.length - 1];
  const day = (value: string) => fullDay(value, false);
  return <figure className="trend">
    <figcaption>{t('trend.title')}</figcaption>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('trend.summary', { from: number(first.expected), to: number(last.expected), date: day(first.day) })}>
      <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className="trend-axis"/>
      <polygon points={band} className="trend-band"/>
      <polyline points={line} className="trend-line"/>
      <circle cx={x(trend.length - 1)} cy={y(last.expected)} r={4} className="trend-last"/>
      <text x={x(trend.length - 1) + 8} y={y(last.expected) + 4} className="trend-label">{number(last.expected)}</text>
      {/* Generous invisible hit targets carry a hover tooltip for every day. */}
      {trend.map((row, index) => <circle key={row.day} cx={x(index)} cy={y(row.expected)} r={10} className="trend-hit"><title>{t('trend.point', { date: day(row.day), expected: number(row.expected), low: number(row.low), high: number(row.high) })}</title></circle>)}
    </svg>
    <p className="hint">{t('trend.summary', { from: number(first.expected), to: number(last.expected), date: day(first.day) })}</p>
  </figure>;
}

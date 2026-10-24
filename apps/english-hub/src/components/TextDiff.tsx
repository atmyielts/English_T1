import { useMemo } from 'react';
import { useT } from '../i18n';
import { diffStats, diffWords, sideOps, type DiffOp } from '../../../../supabase/functions/_shared/english-text-diff.ts';
import '../depth.css';

const Side = ({ ops, label }: { ops: DiffOp[]; label: string }) => (
  <div className="dp-diff-side">
    <h4>{label}</h4>
    <p className="dp-diff-text" lang="en">
      {ops.map((op, index) =>
        op.type === 'same' ? <span key={index}>{op.text}</span>
          : op.type === 'del' ? <del key={index}>{op.text}</del>
            : <ins key={index}>{op.text}</ins>)}
    </p>
  </div>
);

/** Two versions side by side (stacked on phones): removed words struck out on the left, new words marked on the right. */
export const TextDiff = ({ before, after, beforeLabel, afterLabel }: { before: string; after: string; beforeLabel: string; afterLabel: string }) => {
  const t = useT();
  const ops = useMemo(() => diffWords(before, after), [before, after]);
  const stats = diffStats(ops);
  return (
    <div className="dp-diff">
      <p className="hint" style={{ margin: 0 }}>
        {stats.added || stats.removed
          ? t('depth.diff.stats', { added: stats.added, removed: stats.removed })
          : t('depth.diff.same')}
      </p>
      <div className="dp-diff-grid">
        <Side ops={sideOps(ops, 'before')} label={beforeLabel} />
        <Side ops={sideOps(ops, 'after')} label={afterLabel} />
      </div>
      <p className="dp-legend hint" aria-hidden="true">
        <del>{t('depth.diff.removed')}</del> <ins>{t('depth.diff.added')}</ins>
      </p>
    </div>
  );
};

import { Coins } from 'lucide-react';
import { quoteCredits } from '../../../../packages/ai-core/src/mod.ts';
import { useT } from '../core/index.ts';

/** What one teacher action costs, from the credits table (core's CreditCost speaks of chat replies). */
export function TeacherCost({ creditKey, addOns = [], className = '' }: { creditKey: string; addOns?: string[]; className?: string }) {
  const t = useT();
  let credits = 0;
  try { credits = quoteCredits(creditKey, addOns).credits; } catch { return null; }
  return <span className={`inline-flex items-center gap-1.5 text-xs font-semibold text-gray-700 ${className}`}><Coins size={14} aria-hidden="true"/>{t('teacher.common.cost', { count: credits })}</span>;
}

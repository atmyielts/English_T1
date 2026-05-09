import React, { useEffect, useState } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

interface SubmitConfirmModalProps {
  open: boolean;
  isFinalSection: boolean;
  sectionName: string;
  answeredCount: number;
  totalQuestions: number;
  unansweredQuestionNumbers: number[];
  flaggedCount: number;
  onCancel: () => void;
  onConfirm: () => Promise<void> | void;
}

export const SubmitConfirmModal: React.FC<SubmitConfirmModalProps> = ({
  open,
  isFinalSection,
  sectionName,
  answeredCount,
  totalQuestions,
  unansweredQuestionNumbers,
  flaggedCount,
  onCancel,
  onConfirm,
}) => {
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmText('');
      setSubmitting(false);
    }
  }, [open]);

  if (!open) return null;

  const requiresPhrase = isFinalSection;
  const phrase = 'FINISH';
  const canConfirm = !submitting && (!requiresPhrase || confirmText.trim().toUpperCase() === phrase);

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    try {
      await onConfirm();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className={`px-6 py-5 text-white ${isFinalSection ? 'bg-rose-600' : 'bg-amber-600'}`}>
          <div className="flex items-center gap-3">
            {isFinalSection ? <ShieldCheck size={22} /> : <AlertTriangle size={22} />}
            <div>
              <div className="text-[11px] font-semibold tracking-[0.16em] uppercase opacity-90">
                {isFinalSection ? 'Finish exam' : 'Submit section'}
              </div>
              <div className="text-lg font-semibold">
                {isFinalSection ? 'You are about to finish the exam' : `End ${sectionName} now?`}
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 space-y-1">
            <div>
              Answered: <span className="font-semibold text-slate-900">{answeredCount}</span> / {totalQuestions}
            </div>
            {unansweredQuestionNumbers.length > 0 ? (
              <div className="text-amber-800">
                Unanswered:{' '}
                <span className="font-semibold">
                  {unansweredQuestionNumbers.slice(0, 12).join(', ')}
                  {unansweredQuestionNumbers.length > 12 ? '...' : ''}
                </span>
              </div>
            ) : null}
            {flaggedCount > 0 ? (
              <div className="text-amber-800">
                Flagged for review: <span className="font-semibold">{flaggedCount}</span>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900 space-y-1">
            <div className="font-semibold">Once you {isFinalSection ? 'finish' : 'submit'}:</div>
            <ul className="list-disc pl-5 space-y-0.5">
              <li>You cannot return to this section.</li>
              <li>Your timer for the next section starts immediately.</li>
              {isFinalSection ? <li>Results will be calculated and locked.</li> : null}
            </ul>
          </div>

          {requiresPhrase ? (
            <div>
              <label className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                Type <span className="font-bold text-rose-700">{phrase}</span> to confirm
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={phrase}
                className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-rose-300 focus:border-rose-400 outline-none"
              />
            </div>
          ) : null}
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`px-5 py-2 rounded-lg text-sm font-semibold text-white ${
              isFinalSection ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'
            } disabled:bg-slate-400`}
          >
            {submitting ? 'Submitting...' : isFinalSection ? 'Yes, finish exam' : 'Yes, submit section'}
          </button>
        </div>
      </div>
    </div>
  );
};

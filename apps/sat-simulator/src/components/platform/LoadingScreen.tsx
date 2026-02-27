import React from 'react';

type LoadingScreenProps = {
  label?: string;
  detail?: string;
};

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  label = 'Loading SAT Simulator...',
  detail,
}) => (
  <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-sm p-5">
      <div className="flex items-center gap-3">
        <div className="h-2.5 w-2.5 rounded-full bg-indigo-500 animate-pulse" />
        <div className="text-sm font-semibold text-slate-900">{label}</div>
      </div>
      {detail ? <div className="mt-2 text-xs text-slate-500">{detail}</div> : null}
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full w-1/3 rounded-full bg-slate-300 animate-pulse" />
      </div>
    </div>
  </div>
);

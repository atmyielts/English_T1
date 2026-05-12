import { Loader2 } from 'lucide-react';

export const AccessLoading = (props: { label?: string; detail?: string }) => (
  <div className="access-loading-shell">
    <div className="access-loading-card">
      <div className="access-loading-mark">
        <Loader2 className="spin" size={22} />
      </div>
      <div className="access-loading-copy">
        <h1>{props.label ?? 'Loading'}</h1>
        <p>{props.detail ?? 'Preparing your SAT Practice Lab.'}</p>
      </div>
    </div>
  </div>
);

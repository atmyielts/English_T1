import React from 'react';
import { LoaderCircle, ShieldCheck } from 'lucide-react';

export const AccessLoading: React.FC<{ label: string; detail?: string }> = ({ label, detail }) => (
  <div className="access-loading-shell">
    <section className="access-loading-card" aria-live="polite" aria-busy="true">
      <span className="access-loading-mark" aria-hidden="true">
        <ShieldCheck size={22} strokeWidth={2.4} />
        <LoaderCircle size={18} strokeWidth={2.4} className="spin" />
      </span>
      <div className="access-loading-copy">
        <p className="eyebrow">IELTS Playbook</p>
        <h1>{label}</h1>
        <p>{detail ?? 'We are matching your Schood account and Playbook entitlement.'}</p>
      </div>
    </section>
  </div>
);

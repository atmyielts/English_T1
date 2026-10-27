import { RecoveryBoundary, recoveryRootOptions } from '../../../packages/ui-recovery/src/RecoveryBoundary';
import { observeGuideArrival } from '../../../packages/journey-analytics/src/guide-arrival';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PlaybookApp } from '../../../packages/exam-playbook-web/src/App';
import { SAT_CONFIG } from '../../../packages/exam-playbook-web/src/config';

createRoot(document.getElementById('root')!, recoveryRootOptions).render(
  <StrictMode>
    <RecoveryBoundary app="sat-playbook"><PlaybookApp config={SAT_CONFIG} /></RecoveryBoundary>
  </StrictMode>,
);

observeGuideArrival(
  `${String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1`,
  String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''),
);

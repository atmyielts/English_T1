import { RecoveryBoundary, recoveryRootOptions } from '../../../packages/ui-recovery/src/RecoveryBoundary';
import { observeGuideArrival } from '../../../packages/journey-analytics/src/guide-arrival';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

createRoot(document.getElementById('root')!, recoveryRootOptions).render(
  <StrictMode>
    <RecoveryBoundary app="sat-playbook"><App /></RecoveryBoundary>
  </StrictMode>,
);

observeGuideArrival(
  `${String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1`,
  String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''),
);

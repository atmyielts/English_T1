import { RecoveryBoundary, recoveryRootOptions } from '../../../packages/ui-recovery/src/RecoveryBoundary';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!, recoveryRootOptions).render(
  <StrictMode>
    <RecoveryBoundary app="sat-practice"><App /></RecoveryBoundary>
  </StrictMode>,
);
import { observeGuideArrival } from '../../../packages/journey-analytics/src/guide-arrival';

observeGuideArrival(
  `${String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1`,
  String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''),
);

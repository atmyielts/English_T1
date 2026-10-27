// Must stay first: pins Edge Function calls to the database region before any Supabase client exists.
import '../../../packages/edge-region/src/install';
import { RecoveryBoundary, recoveryRootOptions } from '../../../packages/ui-recovery/src/RecoveryBoundary';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from '../../../packages/service-i18n/src/i18n.tsx';
import { catalogs } from './i18n';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Failed to find root element');

createRoot(root, recoveryRootOptions).render(
  <StrictMode>
    <RecoveryBoundary app="ielts-practice"><I18nProvider catalogs={catalogs}><App /></I18nProvider></RecoveryBoundary>
  </StrictMode>,
);

import { observeGuideArrival } from '../../../packages/journey-analytics/src/guide-arrival';

observeGuideArrival(
  `${String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1`,
  String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''),
);

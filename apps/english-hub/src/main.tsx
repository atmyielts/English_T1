import { recoveryRootOptions } from '../../../packages/ui-recovery/src/RecoveryBoundary';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { installEnglishGlobalRecoveryReporting } from './lib/clientRecovery';
import './index.css';

installEnglishGlobalRecoveryReporting();

createRoot(document.getElementById('root')!, recoveryRootOptions).render(
  <StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AppErrorBoundary>
  </StrictMode>,
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  });
}
import { observeGuideArrival } from '../../../packages/journey-analytics/src/guide-arrival';

observeGuideArrival(
  `${String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1`,
  String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''),
);

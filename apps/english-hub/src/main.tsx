import { recoveryRootOptions } from '../../../packages/ui-recovery/src/RecoveryBoundary';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { I18nProvider } from '../../../packages/service-i18n/src/i18n.tsx';
import App from './App';
import { EnglishProvider } from './app/EnglishContext';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { catalogs } from './i18n';
import { installEnglishGlobalRecoveryReporting } from './lib/clientRecovery';
import './english.css';

installEnglishGlobalRecoveryReporting();

createRoot(document.getElementById('root')!, recoveryRootOptions).render(
  <StrictMode>
    <AppErrorBoundary>
      <I18nProvider catalogs={catalogs}>
        <BrowserRouter>
          <EnglishProvider>
            <App />
          </EnglishProvider>
        </BrowserRouter>
      </I18nProvider>
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

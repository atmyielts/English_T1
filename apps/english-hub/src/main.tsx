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
import { installPwa } from './lib/pwa';
import './english.css';

installEnglishGlobalRecoveryReporting();
// Before render: catches an early install prompt, picks the right app manifest, registers the service worker.
installPwa();

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

import { observeGuideArrival } from '../../../packages/journey-analytics/src/guide-arrival';

observeGuideArrival(
  `${String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1`,
  String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''),
);

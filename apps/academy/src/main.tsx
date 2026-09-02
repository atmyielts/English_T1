import { lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { LazyRouteBoundary } from './components/workspace/LazyRouteBoundary';
import { I18nProvider, translate } from './i18n';
import './index.css';

const App = lazy(() => import('./App'));
const AcademyTelegramApp = lazy(() => import('./components/telegram/AcademyTelegramApp'));
const AssessmentCertificatePage = lazy(() => import('./components/assessments/AssessmentCertificatePage'));
const verificationRoute = window.location.pathname === '/verify-assessment';
const telegramRoute = /^\/(?:academy\/)?telegram(?:\/|$)/.test(window.location.pathname);

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');

createRoot(root).render(
  <I18nProvider>
    <BrowserRouter>
      {!telegramRoute ? <LanguageSwitcher /> : null}
      <LazyRouteBoundary fallback={<main className="ts-loading" aria-busy="true">{translate('Loading Academy')}</main>}>
        {verificationRoute ? <AssessmentCertificatePage /> : telegramRoute ? <AcademyTelegramApp /> : <App />}
      </LazyRouteBoundary>
    </BrowserRouter>
  </I18nProvider>,
);

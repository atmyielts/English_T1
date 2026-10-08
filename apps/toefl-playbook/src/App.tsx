import { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { TOEFL_PLAYBOOK_PRODUCT_SLUG } from './lib/constants';
import { PlatformRedirect } from './components/platform/PlatformRedirect';
import { RequireProductEntitlement } from './components/platform/RequireProductEntitlement';
import { LandingPage } from './pages/LandingPage';

const DashboardPage = lazy(async () => ({ default: (await import('./pages/DashboardPage')).DashboardPage }));
const OnboardingPage = lazy(async () => ({ default: (await import('./pages/OnboardingPage')).OnboardingPage }));
const DiagnosticPage = lazy(async () => ({ default: (await import('./pages/DiagnosticPage')).DiagnosticPage }));
const PlanPage = lazy(async () => ({ default: (await import('./pages/PlanPage')).PlanPage }));
const ModulesPage = lazy(async () => ({ default: (await import('./pages/ModulesPage')).ModulesPage }));
const ContentPage = lazy(async () => ({ default: (await import('./pages/ContentPage')).ContentPage }));

const pageFallback = <div className="route-loading">Loading TOEFL Playbook...</div>;
const lazyPage = (node: ReactNode) => <Suspense fallback={pageFallback}>{node}</Suspense>;

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<PlatformRedirect path="/auth" productSlug={TOEFL_PLAYBOOK_PRODUCT_SLUG} />} />
        <Route path="/pricing" element={<PlatformRedirect path="/pricing" productSlug={TOEFL_PLAYBOOK_PRODUCT_SLUG} />} />
        <Route path="/checkout" element={<PlatformRedirect path="/checkout" productSlug={TOEFL_PLAYBOOK_PRODUCT_SLUG} />} />
        <Route path="/account" element={<PlatformRedirect path="/account" productSlug={TOEFL_PLAYBOOK_PRODUCT_SLUG} />} />

        <Route path="/" element={<LandingPage />} />
        <Route path="/modules" element={lazyPage(<ModulesPage />)} />

        <Route element={<RequireProductEntitlement />}>
          <Route path="/dashboard" element={lazyPage(<DashboardPage />)} />
          <Route path="/onboarding" element={lazyPage(<OnboardingPage />)} />
          <Route path="/diagnostic" element={lazyPage(<DiagnosticPage />)} />
          <Route path="/plans/:slug" element={lazyPage(<PlanPage />)} />
        </Route>

        {/* Content pages are public/authenticated/premium-gated per page. */}
        <Route path="/:slug" element={lazyPage(<ContentPage />)} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

import { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SAT_PRACTICE_PRODUCT_SLUG } from './lib/constants';
import { PlatformRedirect } from './components/platform/PlatformRedirect';
import { RequireProductEntitlement } from './components/platform/RequireProductEntitlement';
import { LandingPage } from './pages/LandingPage';

const DashboardPage = lazy(async () => ({ default: (await import('./pages/DashboardPage')).DashboardPage }));
const OnboardingPage = lazy(async () => ({ default: (await import('./pages/OnboardingPage')).OnboardingPage }));
const TodaySessionPage = lazy(async () => ({ default: (await import('./pages/TodaySessionPage')).TodaySessionPage }));
const LabPage = lazy(async () => ({ default: (await import('./pages/LabPage')).LabPage }));
const BankPage = lazy(async () => ({ default: (await import('./pages/BankPage')).BankPage }));
const NotebookPage = lazy(async () => ({ default: (await import('./pages/NotebookPage')).NotebookPage }));
const ReviewsDuePage = lazy(async () => ({ default: (await import('./pages/ReviewsDuePage')).ReviewsDuePage }));
const SessionResultsPage = lazy(async () => ({ default: (await import('./pages/SessionResultsPage')).SessionResultsPage }));
const PlanPage = lazy(async () => ({ default: (await import('./pages/PlanPage')).PlanPage }));
const TutorPage = lazy(async () => ({ default: (await import('./pages/TutorPage')).TutorPage }));

const pageFallback = <div className="route-loading">Loading SAT Practice Lab...</div>;
const lazyPage = (node: ReactNode) => <Suspense fallback={pageFallback}>{node}</Suspense>;

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<PlatformRedirect path="/auth" productSlug={SAT_PRACTICE_PRODUCT_SLUG} />} />
        <Route path="/pricing" element={<PlatformRedirect path="/pricing" productSlug={SAT_PRACTICE_PRODUCT_SLUG} />} />
        <Route path="/checkout" element={<PlatformRedirect path="/checkout" productSlug={SAT_PRACTICE_PRODUCT_SLUG} />} />
        <Route path="/account" element={<PlatformRedirect path="/account" productSlug={SAT_PRACTICE_PRODUCT_SLUG} />} />
        <Route path="/" element={<LandingPage />} />
        <Route element={<RequireProductEntitlement />}>
          <Route path="/dashboard" element={lazyPage(<DashboardPage />)} />
          <Route path="/onboarding" element={lazyPage(<OnboardingPage />)} />
          <Route path="/today" element={lazyPage(<TodaySessionPage />)} />
          <Route path="/lab/:attemptId" element={lazyPage(<LabPage />)} />
          <Route path="/bank" element={lazyPage(<BankPage />)} />
          <Route path="/notebook" element={lazyPage(<NotebookPage />)} />
          <Route path="/reviews" element={lazyPage(<ReviewsDuePage />)} />
          <Route path="/results/:attemptId" element={lazyPage(<SessionResultsPage />)} />
          <Route path="/plan" element={lazyPage(<PlanPage />)} />
          <Route path="/tutor/:questionId" element={lazyPage(<TutorPage />)} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

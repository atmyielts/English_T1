import { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { IELTS_PRACTICE_PRODUCT_SLUG } from './lib/constants';
import { PlatformRedirect } from './components/platform/PlatformRedirect';
import { RequireProductEntitlement } from './components/platform/RequireProductEntitlement';
import { RequireAdmin } from './components/platform/RequireAdmin';
import { LandingPage } from './pages/LandingPage';

const DashboardPage = lazy(async () => ({ default: (await import('./pages/DashboardPage')).DashboardPage }));
const TodaySessionPage = lazy(async () => ({ default: (await import('./pages/TodaySessionPage')).TodaySessionPage }));
const PlanPage = lazy(async () => ({ default: (await import('./pages/PlanPage')).PlanPage }));
const LabPage = lazy(async () => ({ default: (await import('./pages/LabPage')).LabPage }));
const ExercisePage = lazy(async () => ({ default: (await import('./pages/ExercisePage')).ExercisePage }));
const ResultsPage = lazy(async () => ({ default: (await import('./pages/ResultsPage')).ResultsPage }));
const SessionResultsPage = lazy(async () => ({ default: (await import('./pages/SessionResultsPage')).SessionResultsPage }));
const ReviewsDuePage = lazy(async () => ({ default: (await import('./pages/ReviewsDuePage')).ReviewsDuePage }));
const StatsByTypePage = lazy(async () => ({ default: (await import('./pages/StatsByTypePage')).StatsByTypePage }));
const AdminPage = lazy(async () => ({ default: (await import('./pages/AdminPage')).AdminPage }));

const SharedExamPlayer = lazy(async () => {
  const module = await import('../../ielts-simulator/src/pages/ExamPlayer');
  return { default: module.ExamPlayer };
});

const SharedReviewSessionPage = lazy(async () => {
  const module = await import('../../ielts-simulator/src/pages/ReviewSessionPage');
  return { default: module.ReviewSessionPage };
});

const sessionRuntimeFallback = (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
    <div className="glass dashboard-alert">Loading practice session...</div>
  </div>
);

const pageFallback = (
  <div className="practice-root">
    <div className="route-loading">Loading IELTS Practice...</div>
  </div>
);

const lazyPage = (node: ReactNode) => (
  <Suspense fallback={pageFallback}>
    {node}
  </Suspense>
);

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<PlatformRedirect path="/auth" productSlug={IELTS_PRACTICE_PRODUCT_SLUG} />} />
        <Route path="/pricing" element={<PlatformRedirect path="/pricing" productSlug={IELTS_PRACTICE_PRODUCT_SLUG} />} />
        <Route path="/checkout" element={<PlatformRedirect path="/checkout" productSlug={IELTS_PRACTICE_PRODUCT_SLUG} />} />
        <Route path="/account" element={<PlatformRedirect path="/account" productSlug={IELTS_PRACTICE_PRODUCT_SLUG} />} />
        <Route path="/contact" element={<PlatformRedirect path="/contact" productSlug={IELTS_PRACTICE_PRODUCT_SLUG} />} />
        <Route path="/platform-home" element={<PlatformRedirect path="/" productSlug={IELTS_PRACTICE_PRODUCT_SLUG} />} />

        <Route path="/" element={<LandingPage />} />

        <Route element={<RequireProductEntitlement />}>
          <Route path="/dashboard" element={lazyPage(<DashboardPage />)} />
          <Route path="/today" element={lazyPage(<TodaySessionPage />)} />
          <Route path="/plan" element={lazyPage(<PlanPage />)} />
          <Route path="/lab/:practiceSessionId" element={lazyPage(<LabPage />)} />
          <Route
            path="/session/:sessionId/results"
            element={lazyPage(<SessionResultsPage />)}
          />
          <Route
            path="/session/:sessionId/review"
            element={(
              <Suspense fallback={sessionRuntimeFallback}>
                <SharedReviewSessionPage />
              </Suspense>
            )}
          />
          <Route
            path="/session/:sessionId/:sectionId"
            element={(
              <Suspense fallback={sessionRuntimeFallback}>
                <SharedExamPlayer />
              </Suspense>
            )}
          />
          <Route path="/exercise/:id" element={lazyPage(<ExercisePage />)} />
          <Route path="/results/:attempt_id" element={lazyPage(<ResultsPage />)} />
          <Route path="/practice/reviews" element={lazyPage(<ReviewsDuePage />)} />
          <Route path="/practice/stats/by-type" element={lazyPage(<StatsByTypePage />)} />
        </Route>

        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={lazyPage(<AdminPage />)} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;


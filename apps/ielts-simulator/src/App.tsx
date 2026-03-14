import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RequireAdmin } from './components/platform/RequireAdmin';
import { RequireProductEntitlement } from './components/platform/RequireProductEntitlement';
import { IELTS_PRODUCT_ID, IELTS_PRODUCT_SLUG } from './lib/constants';
import { PlatformRedirect } from './components/platform/PlatformRedirect';
import { UpdatesButton } from './components/platform/UpdatesButton';

const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })));
const LandingPage = lazy(() => import('./pages/LandingPage').then((m) => ({ default: m.LandingPage })));
const PracticePage = lazy(() => import('./pages/PracticePage').then((m) => ({ default: m.PracticePage })));
const FullExamPage = lazy(() => import('./pages/FullExamPage').then((m) => ({ default: m.FullExamPage })));
const StatsPage = lazy(() => import('./pages/StatsPage').then((m) => ({ default: m.StatsPage })));
const ReviewPage = lazy(() => import('./pages/ReviewPage').then((m) => ({ default: m.ReviewPage })));
const ReviewSessionPage = lazy(() => import('./pages/ReviewSessionPage').then((m) => ({ default: m.ReviewSessionPage })));
const TestOverview = lazy(() => import('./pages/TestOverview').then((m) => ({ default: m.TestOverview })));
const ExamPlayer = lazy(() => import('./pages/ExamPlayer').then((m) => ({ default: m.ExamPlayer })));
const SessionResultsPage = lazy(() => import('./pages/SessionResultsPage').then((m) => ({ default: m.SessionResultsPage })));
const CandidateHandoff = lazy(() => import('./pages/CandidateHandoff').then((m) => ({ default: m.CandidateHandoff })));

const AdminTestsPage = lazy(() => import('./pages/AdminTestsPage').then((m) => ({ default: m.AdminTestsPage })));
const AdminBuilderPage = lazy(() => import('./pages/AdminBuilderPage').then((m) => ({ default: m.AdminBuilderPage })));
const AdminPartJsonBuilderPage = lazy(() =>
  import('./pages/AdminPartJsonBuilderPage').then((m) => ({ default: m.AdminPartJsonBuilderPage })),
);
const AdminAssetsPage = lazy(() => import('./pages/AdminAssetsPage').then((m) => ({ default: m.AdminAssetsPage })));
const AdminImportPage = lazy(() => import('./pages/AdminImportPage').then((m) => ({ default: m.AdminImportPage })));

const RouteLoading: React.FC<{ label?: string }> = ({ label }) => (
  <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-blue-50/40 flex items-center justify-center p-6">
    <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white/90 shadow-sm backdrop-blur p-7">
      <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-slate-500">Please wait</div>
      <div className="mt-2 text-lg font-semibold text-slate-900">{label ?? 'Preparing your IELTS workspace...'}</div>
      <div className="mt-4 flex items-center gap-3">
        <div className="h-7 w-7 rounded-full border-2 border-slate-200 border-t-slate-700 animate-spin" />
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.2s]" />
          <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce [animation-delay:-0.1s]" />
          <span className="h-2 w-2 rounded-full bg-slate-400 animate-bounce" />
        </div>
      </div>
      <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div className="h-full w-1/3 rounded-full bg-slate-300 animate-pulse" />
      </div>
    </div>
  </div>
);

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/auth" element={<PlatformRedirect path="/auth" productSlug={IELTS_PRODUCT_SLUG} />} />
          <Route path="/pricing" element={<PlatformRedirect path="/pricing" productSlug={IELTS_PRODUCT_SLUG} />} />
          <Route path="/checkout" element={<PlatformRedirect path="/checkout" productSlug={IELTS_PRODUCT_SLUG} />} />
          <Route path="/account" element={<PlatformRedirect path="/account" productSlug={IELTS_PRODUCT_SLUG} />} />
          <Route path="/contact" element={<PlatformRedirect path="/contact" productSlug={IELTS_PRODUCT_SLUG} />} />
          <Route path="/platform-home" element={<PlatformRedirect path="/" productSlug={IELTS_PRODUCT_SLUG} />} />

          <Route path="/" element={<LandingPage />} />
          <Route path="/candidate" element={<CandidateHandoff />} />
          <Route path="/candidate/session/:sessionId/:sectionId" element={<ExamPlayer />} />
          <Route path="/candidate/session/:sessionId/results" element={<SessionResultsPage />} />

          <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<Navigate to="/admin/tests" replace />} />
          <Route path="/admin/tests" element={<AdminTestsPage />} />
          <Route path="/admin/test/:testId" element={<TestOverview />} />
          <Route path="/admin/session/:sessionId/:sectionId" element={<ExamPlayer />} />
          <Route path="/admin/session/:sessionId/results" element={<SessionResultsPage />} />
          <Route path="/admin/builder" element={<AdminBuilderPage />} />
          <Route path="/admin/part-builder" element={<AdminPartJsonBuilderPage />} />
          <Route path="/admin/assets" element={<AdminAssetsPage />} />
          <Route path="/admin/import" element={<AdminImportPage />} />
        </Route>

          <Route element={<RequireProductEntitlement productId={IELTS_PRODUCT_ID} productSlug={IELTS_PRODUCT_SLUG} />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/practice" element={<PracticePage />} />
            <Route path="/full-exam" element={<FullExamPage />} />
            <Route path="/stats" element={<StatsPage />} />
            <Route path="/review" element={<ReviewPage />} />
            <Route path="/review/:sessionId" element={<ReviewSessionPage />} />
            <Route path="/test/:testId" element={<TestOverview />} />
            <Route path="/session/:sessionId/:sectionId" element={<ExamPlayer />} />
            <Route path="/session/:sessionId/results" element={<SessionResultsPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <UpdatesButton />
    </BrowserRouter>
  );
}

export default App;

import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RequireAdmin } from './components/platform/RequireAdmin';
import { RequireAdminPermission } from './components/platform/RequireAdminPermission';
import { AdminIndexRedirect } from './components/platform/AdminIndexRedirect';
import { RequireProductEntitlement } from './components/platform/RequireProductEntitlement';
import { SAT_PRODUCT_ID, SAT_PRODUCT_SLUG } from './lib/constants';
import { PlatformRedirect } from './components/platform/PlatformRedirect';
import { UpdatesButton } from './components/platform/UpdatesButton';
import { LoadingScreen } from './components/platform/LoadingScreen';

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
const AdminAssetsPage = lazy(() => import('./pages/AdminAssetsPage').then((m) => ({ default: m.AdminAssetsPage })));
const AdminImportPage = lazy(() => import('./pages/AdminImportPage').then((m) => ({ default: m.AdminImportPage })));

const RouteLoading: React.FC<{ label?: string }> = ({ label }) => (
  <LoadingScreen label={label ?? 'Loading SAT workspace...'} />
);

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/auth" element={<PlatformRedirect path="/auth" productSlug={SAT_PRODUCT_SLUG} />} />
          <Route path="/admin-mfa" element={<PlatformRedirect path="/admin-mfa" productSlug={SAT_PRODUCT_SLUG} />} />
          <Route path="/pricing" element={<PlatformRedirect path="/pricing" productSlug={SAT_PRODUCT_SLUG} />} />
          <Route path="/checkout" element={<PlatformRedirect path="/checkout" productSlug={SAT_PRODUCT_SLUG} />} />
          <Route path="/account" element={<PlatformRedirect path="/account" productSlug={SAT_PRODUCT_SLUG} />} />
          <Route path="/contact" element={<PlatformRedirect path="/contact" productSlug={SAT_PRODUCT_SLUG} />} />
          <Route path="/platform-home" element={<PlatformRedirect path="/" productSlug={SAT_PRODUCT_SLUG} />} />

          <Route path="/" element={<LandingPage />} />
          <Route path="/candidate" element={<CandidateHandoff />} />
          <Route path="/candidate/session/:sessionId/:sectionId" element={<ExamPlayer />} />
          <Route path="/candidate/session/:sessionId/results" element={<SessionResultsPage />} />

          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<AdminIndexRedirect />} />
            <Route
              path="/admin/tests"
              element={
                <RequireAdminPermission permission="admin.tests.manage" title="Tests">
                  <AdminTestsPage />
                </RequireAdminPermission>
              }
            />
            <Route
              path="/admin/test/:testId"
              element={
                <RequireAdminPermission permission="admin.tests.manage" title="Test overview">
                  <TestOverview />
                </RequireAdminPermission>
              }
            />
            <Route
              path="/admin/session/:sessionId/:sectionId"
              element={
                <RequireAdminPermission permission="admin.tests.manage" title="Admin session player">
                  <ExamPlayer />
                </RequireAdminPermission>
              }
            />
            <Route
              path="/admin/session/:sessionId/results"
              element={
                <RequireAdminPermission permission="admin.tests.manage" title="Admin session results">
                  <SessionResultsPage />
                </RequireAdminPermission>
              }
            />
            <Route
              path="/admin/builder"
              element={
                <RequireAdminPermission permission="admin.builder.manage" title="Builder">
                  <AdminBuilderPage />
                </RequireAdminPermission>
              }
            />
            <Route
              path="/admin/assets"
              element={
                <RequireAdminPermission permission="admin.assets.manage" title="Assets">
                  <AdminAssetsPage />
                </RequireAdminPermission>
              }
            />
            <Route
              path="/admin/import"
              element={
                <RequireAdminPermission permission="admin.builder.manage" title="Import">
                  <AdminImportPage />
                </RequireAdminPermission>
              }
            />
          </Route>

          <Route element={<RequireProductEntitlement productId={SAT_PRODUCT_ID} productSlug={SAT_PRODUCT_SLUG} />}>
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

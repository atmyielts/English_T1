import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { IELTS_PRACTICE_PRODUCT_SLUG } from './lib/constants';
import { PlatformRedirect } from './components/platform/PlatformRedirect';
import { RequireProductEntitlement } from './components/platform/RequireProductEntitlement';
import { RequireAdmin } from './components/platform/RequireAdmin';
import { LandingPage } from './pages/LandingPage';
import { DashboardPage } from './pages/DashboardPage';
import { PlanPage } from './pages/PlanPage';
import { ExercisePage } from './pages/ExercisePage';
import { ResultsPage } from './pages/ResultsPage';
import { AdminPage } from './pages/AdminPage';

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
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/plan" element={<PlanPage />} />
          <Route path="/exercise/:id" element={<ExercisePage />} />
          <Route path="/results/:attempt_id" element={<ResultsPage />} />
        </Route>

        <Route element={<RequireAdmin />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;


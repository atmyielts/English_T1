import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAdmin } from './components/platform/RequireAdmin';
import { RequireProductEntitlement } from './components/platform/RequireProductEntitlement';
import { AdminPage } from './pages/AdminPage';
import { ContentPage } from './pages/ContentPage';
import { DashboardPage } from './pages/DashboardPage';
import { DiagnosticPage } from './pages/DiagnosticPage';
import { LandingPage } from './pages/LandingPage';
import { NotesPage } from './pages/NotesPage';
import { OnboardingPage } from './pages/OnboardingPage';
import { PlanPage } from './pages/PlanPage';

const App: React.FC = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/platform/callback" element={<Navigate to="/" replace />} />

      <Route path="/" element={<LandingPage />} />
      <Route path="/updates" element={<Navigate to="/updates-policy" replace />} />

      <Route element={<RequireProductEntitlement />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/diagnostic" element={<DiagnosticPage />} />
        <Route path="/notes" element={<NotesPage />} />
        <Route path="/plans/:slug" element={<PlanPage />} />
      </Route>

      <Route element={<RequireAdmin anyOf={['admin.products.manage', 'admin.analytics.view', 'admin.announcements.manage']} />}>
        <Route path="/admin" element={<AdminPage section="dashboard" />} />
        <Route path="/admin/content" element={<AdminPage section="content" />} />
        <Route path="/admin/content/:id" element={<AdminPage section="content-detail" />} />
        <Route path="/admin/updates" element={<AdminPage section="updates" />} />
        <Route path="/admin/markets" element={<AdminPage section="markets" />} />
        <Route path="/admin/sources" element={<AdminPage section="sources" />} />
        <Route path="/admin/plan-templates" element={<AdminPage section="plan-templates" />} />
        <Route path="/admin/rules" element={<AdminPage section="rules" />} />
        <Route path="/admin/preview" element={<AdminPage section="preview" />} />
        <Route path="/admin/analytics" element={<AdminPage section="analytics" />} />
      </Route>

      <Route path="/:slug" element={<ContentPage />} />
    </Routes>
  </BrowserRouter>
);

export default App;

import { Suspense, lazy, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { I18nProvider } from '../../service-i18n/src/i18n.tsx';
import { Shell } from './components/TopNav';
import { RequireAdmin, RequirePremium, Skeleton } from './components/ui';
import type { ExamConfig } from './config';
import { catalogs } from './i18n';
import { PlaybookProvider } from './lib/context';
import { buildPlatformUrl } from './lib/platformUrls';
import { LandingPage } from './pages/LandingPage';
import './styles.css';
import './engine.css';

const ContentPage = lazy(async () => ({ default: (await import('./pages/ContentPage')).ContentPage }));
const ModulesPage = lazy(async () => ({ default: (await import('./pages/ModulesPage')).ModulesPage }));
const DashboardPage = lazy(async () => ({ default: (await import('./pages/DashboardPage')).DashboardPage }));
const DiagnosticPage = lazy(async () => ({ default: (await import('./pages/DiagnosticPage')).DiagnosticPage }));
const OnboardingPage = lazy(async () => ({ default: (await import('./pages/OnboardingPage')).OnboardingPage }));
const PlansPage = lazy(async () => ({ default: (await import('./pages/PlanPage')).PlansPage }));
const PlanPage = lazy(async () => ({ default: (await import('./pages/PlanPage')).PlanPage }));
const NotesPage = lazy(async () => ({ default: (await import('./pages/NotesPage')).NotesPage }));
const AdminPage = lazy(async () => ({ default: (await import('./pages/AdminPage')).AdminPage }));

const fallback = <Shell><Skeleton lines={2} /><Skeleton lines={6} /></Shell>;
const page = (node: ReactNode) => <Suspense fallback={fallback}>{node}</Suspense>;

/** /auth, /pricing, /checkout, /account live on the platform. */
const ToPlatform = ({ path, productSlug }: { path: string; productSlug: string }) => {
  const location = useLocation();
  const returnTo = `${window.location.origin}${location.state?.from ?? '/'}`;
  window.location.assign(buildPlatformUrl(path, { product: productSlug }, returnTo));
  return null;
};

export const PlaybookApp = ({ config }: { config: ExamConfig }) => (
  <I18nProvider catalogs={catalogs}>
    <PlaybookProvider config={config}>
      <BrowserRouter>
        <Routes>
          {['/auth', '/pricing', '/checkout', '/account'].map((path) => (
            <Route key={path} path={path} element={<ToPlatform path={path} productSlug={config.productSlug} />} />
          ))}
          <Route path="/" element={<LandingPage />} />
          <Route path="/modules" element={page(<ModulesPage />)} />
          <Route path="/plans" element={page(<PlansPage />)} />
          <Route path="/plans/:slug" element={page(<PlanPage />)} />
          <Route element={<RequirePremium />}>
            <Route path="/dashboard" element={page(<DashboardPage />)} />
            <Route path="/diagnostic" element={page(<DiagnosticPage />)} />
            <Route path="/onboarding" element={page(<OnboardingPage />)} />
            <Route path="/notes" element={page(<NotesPage />)} />
          </Route>
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={page(<AdminPage section="overview" />)} />
            <Route path="/admin/pages" element={page(<AdminPage section="pages" />)} />
            <Route path="/admin/pages/:id" element={page(<AdminPage section="page" />)} />
            <Route path="/admin/sources" element={page(<AdminPage section="sources" />)} />
            <Route path="/admin/plans" element={page(<AdminPage section="plans" />)} />
            <Route path="/admin/preview" element={page(<AdminPage section="preview" />)} />
            <Route path="/admin/analytics" element={page(<AdminPage section="analytics" />)} />
          </Route>
          <Route path="/:slug" element={page(<ContentPage />)} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </PlaybookProvider>
  </I18nProvider>
);

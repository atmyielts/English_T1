import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { RequireAuth } from './components/platform/RequireAuth';
import { RequireAdmin } from './components/platform/RequireAdmin';
import { RequireAdminPermission } from './components/platform/RequireAdminPermission';
import { AdminIndexRedirect } from './components/platform/AdminIndexRedirect';
import { UpdatesButton } from './components/platform/UpdatesButton';
import { useI18n } from './i18n';

const AuthPage = lazy(() => import('./pages/AuthPage').then((m) => ({ default: m.AuthPage })));
const HomePage = lazy(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const AboutPage = lazy(() => import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })));
const FAQPage = lazy(() => import('./pages/FAQPage').then((m) => ({ default: m.FAQPage })));
const ContactPage = lazy(() => import('./pages/ContactPage').then((m) => ({ default: m.ContactPage })));
const UpdatesPage = lazy(() => import('./pages/UpdatesPage').then((m) => ({ default: m.UpdatesPage })));
const PlansPage = lazy(() => import('./pages/PlansPage').then((m) => ({ default: m.PlansPage })));
const PricingPage = lazy(() => import('./pages/PricingPage').then((m) => ({ default: m.PricingPage })));
const CheckoutPage = lazy(() => import('./pages/CheckoutPage').then((m) => ({ default: m.CheckoutPage })));
const AccountPage = lazy(() => import('./pages/AccountPage').then((m) => ({ default: m.AccountPage })));
const CandidateEntryPage = lazy(() => import('./pages/CandidateEntryPage').then((m) => ({ default: m.CandidateEntryPage })));
const TeacherOfficePage = lazy(() => import('./pages/TeacherOfficePage').then((m) => ({ default: m.TeacherOfficePage })));
const AdminMfaPage = lazy(() => import('./pages/AdminMfaPage').then((m) => ({ default: m.AdminMfaPage })));
const AdminBillingPage = lazy(() => import('./pages/admin/AdminBillingPage').then((m) => ({ default: m.AdminBillingPage })));
const AdminProductsPage = lazy(() => import('./pages/admin/AdminProductsPage').then((m) => ({ default: m.AdminProductsPage })));
const AdminCouponsPage = lazy(() => import('./pages/admin/AdminCouponsPage').then((m) => ({ default: m.AdminCouponsPage })));
const AdminPaymentsPage = lazy(() => import('./pages/admin/AdminPaymentsPage').then((m) => ({ default: m.AdminPaymentsPage })));
const AdminUsersPage = lazy(() => import('./pages/admin/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })));
const AdminAnalyticsPage = lazy(() => import('./pages/admin/AdminAnalyticsPage').then((m) => ({ default: m.AdminAnalyticsPage })));
const AdminSettingsPage = lazy(() => import('./pages/admin/AdminSettingsPage').then((m) => ({ default: m.AdminSettingsPage })));
const AdminTrialsPage = lazy(() => import('./pages/admin/AdminTrialsPage').then((m) => ({ default: m.AdminTrialsPage })));
const AdminSupportPage = lazy(() => import('./pages/admin/AdminSupportPage').then((m) => ({ default: m.AdminSupportPage })));
const AdminAnnouncementsPage = lazy(() => import('./pages/admin/AdminAnnouncementsPage').then((m) => ({ default: m.AdminAnnouncementsPage })));

const RouteLoading: React.FC<{ label?: string }> = ({ label }) => {
  const { t } = useI18n();
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="text-xs font-semibold tracking-wider uppercase text-gray-500 mb-2">{t('route.loadingLabel')}</div>
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
          <div className="font-semibold text-gray-900">{label ?? t('route.preparingPage')}</div>
          <div className="mt-4 space-y-3">
            <div className="h-3 bg-gray-100 rounded w-5/6" />
            <div className="h-3 bg-gray-100 rounded w-2/3" />
            <div className="h-3 bg-gray-100 rounded w-3/4" />
          </div>
        </div>
      </div>
    </div>
  );
};

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/faq" element={<FAQPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/updates" element={<UpdatesPage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/candidate" element={<CandidateEntryPage />} />

          <Route element={<RequireAuth />}>
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/admin-mfa" element={<AdminMfaPage />} />
            <Route path="/workspace/student" element={<Navigate to="/" replace />} />
            <Route path="/student-workspace" element={<Navigate to="/" replace />} />
            <Route path="/teacher" element={<TeacherOfficePage />} />
          </Route>
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<AdminIndexRedirect />} />
            <Route
              path="/admin/analytics"
              element={
                <RequireAdminPermission permission="admin.analytics.view" title="Analytics">
                  <AdminAnalyticsPage />
                </RequireAdminPermission>
              }
            />
            <Route
              path="/admin/products"
              element={
                <RequireAdminPermission permission="admin.products.manage" title="Products">
                  <AdminProductsPage />
                </RequireAdminPermission>
              }
            />
            <Route
              path="/admin/billing"
              element={
                <RequireAdminPermission permission="admin.billing.manage" title="Billing">
                  <AdminBillingPage />
                </RequireAdminPermission>
              }
            />
            <Route
              path="/admin/coupons"
              element={
                <RequireAdminPermission permission="admin.coupons.manage" title="Coupons">
                  <AdminCouponsPage />
                </RequireAdminPermission>
              }
            />
            <Route
              path="/admin/payments"
              element={
                <RequireAdminPermission permission="admin.payments.manage" title="Payments">
                  <AdminPaymentsPage />
                </RequireAdminPermission>
              }
            />
            <Route
              path="/admin/users"
              element={
                <RequireAdminPermission permission="admin.users.manage" title="Users">
                  <AdminUsersPage />
                </RequireAdminPermission>
              }
            />
            <Route
              path="/admin/trials"
              element={
                <RequireAdminPermission permission="admin.trials.manage" title="Trials">
                  <AdminTrialsPage />
                </RequireAdminPermission>
              }
            />
            <Route
              path="/admin/settings"
              element={
                <RequireAdminPermission permission="admin.settings.manage" title="Settings">
                  <AdminSettingsPage />
                </RequireAdminPermission>
              }
            />
            <Route
              path="/admin/support"
              element={
                <RequireAdminPermission permission="admin.support.manage" title="Support">
                  <AdminSupportPage />
                </RequireAdminPermission>
              }
            />
            <Route
              path="/admin/announcements"
              element={
                <RequireAdminPermission permission="admin.announcements.manage" title="Announcements">
                  <AdminAnnouncementsPage />
                </RequireAdminPermission>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
      <UpdatesButton />
    </BrowserRouter>
  );
}

export default App;

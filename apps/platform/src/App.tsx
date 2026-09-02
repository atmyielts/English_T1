import React, { Suspense, lazy, useEffect } from 'react';
import { observeGuideArrival } from '../../../packages/journey-analytics/src/guide-arrival';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { RequireAuth } from './components/platform/RequireAuth';
import { RequireAdmin } from './components/platform/RequireAdmin';
import { RequireAdminPermission } from './components/platform/RequireAdminPermission';
import { ReferralCapture } from './components/platform/ReferralCapture';
import { UpdatesButton } from './components/platform/UpdatesButton';
import { useI18n } from './i18n';

const GuidePage = lazy(() => import('./pages/GuidePage').then(m => ({ default: m.GuidePage })));
const AdminOnboardingPage = lazy(() => import('./pages/admin/AdminOnboardingPage').then(m => ({ default: m.AdminOnboardingPage })));

const lazyWithChunkRetry = <T extends React.ComponentType<any>>(factory: () => Promise<{ default: T }>) =>
  lazy(async () => {
    try {
      const module = await factory();
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('__schood_chunk_reload__');
      }
      return module;
    } catch (error) {
      if (typeof window !== 'undefined') {
        const key = '__schood_chunk_reload__';
        const alreadyRetried = sessionStorage.getItem(key) === '1';
        if (!alreadyRetried) {
          sessionStorage.setItem(key, '1');
          const refreshUrl = new URL(window.location.href);
          refreshUrl.searchParams.set('refresh', Date.now().toString());
          window.location.replace(refreshUrl.toString());
        } else {
          sessionStorage.removeItem(key);
        }
      }
      throw error;
    }
  });

const AuthPage = lazyWithChunkRetry(() => import('./pages/AuthPage').then((m) => ({ default: m.AuthPage })));
const HomePage = lazyWithChunkRetry(() => import('./pages/HomePage').then((m) => ({ default: m.HomePage })));
const AboutPage = lazyWithChunkRetry(() => import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })));
const FAQPage = lazyWithChunkRetry(() => import('./pages/FAQPage').then((m) => ({ default: m.FAQPage })));
const ContactPage = lazyWithChunkRetry(() => import('./pages/ContactPage').then((m) => ({ default: m.ContactPage })));
const UpdatesPage = lazyWithChunkRetry(() => import('./pages/UpdatesPage').then((m) => ({ default: m.UpdatesPage })));
const PlansPage = lazyWithChunkRetry(() => import('./pages/PlansPage').then((m) => ({ default: m.PlansPage })));
const DiscoveryPage = lazyWithChunkRetry(() => import('./pages/DiscoveryPage').then((m) => ({ default: m.DiscoveryPage })));
const PricingPage = lazyWithChunkRetry(() => import('./pages/PricingPage').then((m) => ({ default: m.PricingPage })));
const CheckoutPage = lazyWithChunkRetry(() => import('./pages/CheckoutPage').then((m) => ({ default: m.CheckoutPage })));
const AccountPage = lazyWithChunkRetry(() => import('./pages/AccountPage').then((m) => ({ default: m.AccountPage })));
const CandidateEntryPage = lazyWithChunkRetry(() => import('./pages/CandidateEntryPage').then((m) => ({ default: m.CandidateEntryPage })));
const ReferralLandingPage = lazyWithChunkRetry(() => import('./pages/ReferralLandingPage').then((m) => ({ default: m.ReferralLandingPage })));
const PartnerOfficePage = lazyWithChunkRetry(() => import('./pages/PartnerOfficePage').then((m) => ({ default: m.PartnerOfficePage })));
const CenterOfficePage = lazyWithChunkRetry(() => import('./pages/CenterOfficePage').then((m) => ({ default: m.CenterOfficePage })));
const AcademyControlPage = lazyWithChunkRetry(() => import('./pages/AcademyControlPage').then((m) => ({ default: m.AcademyControlPage })));
const AcademyStudentRedirectPage = lazyWithChunkRetry(() => import('./pages/AcademyStudentRedirectPage').then((m) => ({ default: m.AcademyStudentRedirectPage })));
const StudentCenterPage = lazyWithChunkRetry(() => import('./pages/StudentCenterPage').then((m) => ({ default: m.StudentCenterPage })));
const CertificatePage = lazyWithChunkRetry(() => import('./pages/CertificatePage').then((m) => ({ default: m.CertificatePage })));
const ParentReportPage = lazyWithChunkRetry(() => import('./pages/ParentReportPage').then((m) => ({ default: m.ParentReportPage })));
const TelegramAppPage = lazyWithChunkRetry(() => import('./pages/TelegramAppPage').then((m) => ({ default: m.TelegramAppPage })));
const TelegramDiscoverPage = lazyWithChunkRetry(() => import('./pages/TelegramDiscoverPage').then((m) => ({ default: m.TelegramDiscoverPage })));
const WritingTutorPage = lazyWithChunkRetry(() => import('./pages/WritingTutorPage').then((m) => ({ default: m.WritingTutorPage })));
const SpeakingCoachPage = lazyWithChunkRetry(() => import('./pages/SpeakingCoachPage').then((m) => ({ default: m.SpeakingCoachPage })));
const LearningPathPage = lazyWithChunkRetry(() => import('./pages/LearningPathPage').then((m) => ({ default: m.LearningPathPage })));
const VocabDrillPage = lazyWithChunkRetry(() => import('./pages/VocabDrillPage').then((m) => ({ default: m.VocabDrillPage })));
const PeerReviewPage = lazyWithChunkRetry(() => import('./pages/PeerReviewPage').then((m) => ({ default: m.PeerReviewPage })));
const WhitelabelPage = lazyWithChunkRetry(() => import('./pages/WhitelabelPage').then((m) => ({ default: m.WhitelabelPage })));
const CorporateAssessmentPage = lazyWithChunkRetry(() => import('./pages/CorporateAssessmentPage').then((m) => ({ default: m.CorporateAssessmentPage })));
const TeacherMarketplacePage = lazyWithChunkRetry(() => import('./pages/TeacherMarketplacePage').then((m) => ({ default: m.TeacherMarketplacePage })));
const CenterInitiationPage = lazyWithChunkRetry(() => import('./pages/CenterInitiationPage').then((m) => ({ default: m.CenterInitiationPage })));
const RedeemPage = lazyWithChunkRetry(() => import('./pages/RedeemPage').then((m) => ({ default: m.RedeemPage })));
const CenterLandingPage = lazyWithChunkRetry(() => import('./pages/CenterLandingPage').then((m) => ({ default: m.CenterLandingPage })));
const AdminMfaPage = lazyWithChunkRetry(() => import('./pages/AdminMfaPage').then((m) => ({ default: m.AdminMfaPage })));
const AdminBillingPage = lazyWithChunkRetry(() => import('./pages/admin/AdminBillingPage').then((m) => ({ default: m.AdminBillingPage })));
const AdminProductsPage = lazyWithChunkRetry(() => import('./pages/admin/AdminProductsPage').then((m) => ({ default: m.AdminProductsPage })));
const AdminCouponsPage = lazyWithChunkRetry(() => import('./pages/admin/AdminCouponsPage').then((m) => ({ default: m.AdminCouponsPage })));
const AdminReferralsPage = lazyWithChunkRetry(() => import('./pages/admin/AdminReferralsPage').then((m) => ({ default: m.AdminReferralsPage })));
const AdminPartnersPage = lazyWithChunkRetry(() => import('./pages/admin/AdminPartnersPage').then((m) => ({ default: m.AdminPartnersPage })));
const AdminPaymentsPage = lazyWithChunkRetry(() => import('./pages/admin/AdminPaymentsPage').then((m) => ({ default: m.AdminPaymentsPage })));
const AdminUsersPage = lazyWithChunkRetry(() => import('./pages/admin/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })));
const AdminDashboardPage = lazyWithChunkRetry(() => import('./pages/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })));
const AdminAnalyticsPage = lazyWithChunkRetry(() => import('./pages/admin/AdminAnalyticsPage').then((m) => ({ default: m.AdminAnalyticsPage })));
const AdminFunctionErrorsPage = lazyWithChunkRetry(() => import('./pages/admin/AdminFunctionErrorsPage'));
const AdminSettingsPage = lazyWithChunkRetry(() => import('./pages/admin/AdminSettingsPage').then((m) => ({ default: m.AdminSettingsPage })));
const AdminTrialsPage = lazyWithChunkRetry(() => import('./pages/admin/AdminTrialsPage').then((m) => ({ default: m.AdminTrialsPage })));
const AdminSupportPage = lazyWithChunkRetry(() => import('./pages/admin/AdminSupportPage').then((m) => ({ default: m.AdminSupportPage })));
const AdminAnnouncementsPage = lazyWithChunkRetry(() =>
  import('./pages/admin/AdminAnnouncementsPage').then((m) => ({ default: m.AdminAnnouncementsPage })),
);
const AdminEnglishOverviewPage = lazyWithChunkRetry(() =>
  import('./pages/admin/AdminEnglishOverviewPage').then((m) => ({ default: m.AdminEnglishOverviewPage })),
);
const AdminEnglishContentPage = lazyWithChunkRetry(() =>
  import('./pages/admin/AdminEnglishContentPage').then((m) => ({ default: m.AdminEnglishContentPage })),
);
const AdminEnglishOpsPage = lazyWithChunkRetry(() =>
  import('./pages/admin/AdminEnglishOpsPage').then((m) => ({ default: m.AdminEnglishOpsPage })),
);
const AdminEnglishRulesPage = lazyWithChunkRetry(() =>
  import('./pages/admin/AdminEnglishRulesPage').then((m) => ({ default: m.AdminEnglishRulesPage })),
);

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

const AppChrome: React.FC = () => {
  const location = useLocation();
  useEffect(() => {
    observeGuideArrival(`${String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1`, String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''));
  }, [location.key]);
  if (location.pathname.startsWith('/telegram')) return null;
  return (
    <>
      <ReferralCapture />
      {!location.pathname.startsWith('/start') && <UpdatesButton />}
    </>
  );
};

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/start" element={<GuidePage />} />
          <Route path="/start/result" element={<GuidePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/faq" element={<FAQPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/updates" element={<UpdatesPage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/ielts" element={<DiscoveryPage pageKey="ielts" />} />
          <Route path="/ielts-mock-test" element={<DiscoveryPage pageKey="ieltsMockTest" />} />
          <Route path="/ielts-writing-practice" element={<DiscoveryPage pageKey="ieltsWritingPractice" />} />
          <Route path="/toefl" element={<DiscoveryPage pageKey="toefl" />} />
          <Route path="/toefl-practice-test" element={<DiscoveryPage pageKey="toeflPracticeTest" />} />
          <Route path="/sat" element={<DiscoveryPage pageKey="sat" />} />
          <Route path="/digital-sat-practice-test" element={<DiscoveryPage pageKey="digitalSatPracticeTest" />} />
          <Route path="/english" element={<DiscoveryPage pageKey="english" />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/candidate" element={<CandidateEntryPage />} />
          <Route path="/r/:code" element={<ReferralLandingPage />} />
          <Route path="/redeem" element={<RedeemPage />} />
          <Route path="/redeem/:code" element={<RedeemPage />} />
          <Route path="/education-centers" element={<CenterInitiationPage />} />
          <Route path="/center-initiation" element={<CenterInitiationPage />} />
          <Route path="/center/:slug" element={<CenterLandingPage />} />
          <Route path="/partners/:slug" element={<CenterLandingPage />} />
          <Route path="/certificate" element={<CertificatePage />} />
          <Route path="/parent-report" element={<ParentReportPage />} />
          <Route path="/telegram" element={<TelegramAppPage />} />
          <Route path="/telegram/discover" element={<TelegramDiscoverPage />} />

          <Route element={<RequireAuth />}>
            <Route path="/pricing" element={<PricingPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/admin-mfa" element={<AdminMfaPage />} />
            <Route path="/student-center" element={<StudentCenterPage />} />
            <Route path="/workspace/student" element={<Navigate to="/student-center" replace />} />
            <Route path="/student-workspace" element={<Navigate to="/student-center" replace />} />
            <Route path="/partner" element={<PartnerOfficePage />} />
            <Route path="/center-office" element={<CenterOfficePage />} />
            <Route path="/academy" element={<AcademyControlPage />} />
            <Route path="/academy/office" element={<AcademyControlPage />} />
            <Route path="/academy/office/*" element={<AcademyControlPage />} />
            <Route path="/academy/teacher" element={<AcademyControlPage />} />
            <Route path="/academy/teacher/os" element={<AcademyControlPage />} />
            <Route path="/academy/teacher/*" element={<AcademyControlPage />} />
            <Route path="/academy/admin" element={<AcademyControlPage />} />
            <Route path="/academy/admin/*" element={<AcademyControlPage />} />
            <Route path="/academy/center" element={<AcademyControlPage />} />
            <Route path="/academy/center/*" element={<AcademyControlPage />} />
            <Route path="/academy/classrooms" element={<AcademyControlPage />} />
            <Route path="/academy/classrooms/*" element={<AcademyControlPage />} />
            <Route path="/academy/student" element={<AcademyStudentRedirectPage />} />
            <Route path="/academy/student/*" element={<AcademyStudentRedirectPage />} />
            <Route path="/academy-control" element={<AcademyControlPage />} />
            <Route path="/my-academy" element={<AcademyStudentRedirectPage />} />
            <Route path="/writing-tutor" element={<WritingTutorPage />} />
            <Route path="/speaking-coach" element={<SpeakingCoachPage />} />
            <Route path="/learning-path" element={<LearningPathPage />} />
            <Route path="/vocab-drill" element={<VocabDrillPage />} />
            <Route path="/peer-review" element={<PeerReviewPage />} />
            <Route path="/whitelabel" element={<WhitelabelPage />} />
            <Route path="/corporate-assessment" element={<CorporateAssessmentPage />} />
            <Route path="/marketplace" element={<TeacherMarketplacePage />} />
            <Route path="/education-center" element={<Navigate to="/center-office" replace />} />
            <Route path="/center-admin" element={<Navigate to="/center-office" replace />} />
            <Route path="/teacher" element={<Navigate to="/academy/teacher" replace />} />
          </Route>
          <Route element={<RequireAdmin />}>
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="/admin/onboarding" element={<RequireAdminPermission permission="admin.products.manage" title="Onboarding"><AdminOnboardingPage /></RequireAdminPermission>} />
            <Route
              path="/admin/english"
              element={
                <RequireAdminPermission permission="admin.analytics.view" title="English">
                  <AdminEnglishOverviewPage />
                </RequireAdminPermission>
              }
            />
            <Route
              path="/admin/english/content"
              element={
                <RequireAdminPermission permission="admin.products.manage" title="English Content">
                  <AdminEnglishContentPage />
                </RequireAdminPermission>
              }
            />
            <Route
              path="/admin/english/ops"
              element={
                <RequireAdminPermission permission="admin.analytics.view" title="English Ops">
                  <AdminEnglishOpsPage />
                </RequireAdminPermission>
              }
            />
            <Route
              path="/admin/english/rules"
              element={
                <RequireAdminPermission permission="admin.settings.manage" title="English Rules">
                  <AdminEnglishRulesPage />
                </RequireAdminPermission>
              }
            />
            <Route
              path="/admin/analytics"
              element={
                <RequireAdminPermission permission="admin.analytics.view" title="Analytics">
                  <AdminAnalyticsPage />
                </RequireAdminPermission>
              }
            />
            <Route
              path="/admin/function-errors"
              element={
                <RequireAdminPermission permission="admin.analytics.view" title="Function errors">
                  <AdminFunctionErrorsPage />
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
              path="/admin/referrals"
              element={
                <RequireAdminPermission permission="admin.referrals.manage" title="Referrals">
                  <AdminReferralsPage />
                </RequireAdminPermission>
              }
            />
            <Route
              path="/admin/partners"
              element={
                <RequireAdminPermission permission="admin.partners.manage" title="Partners">
                  <AdminPartnersPage />
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
      <AppChrome />
    </BrowserRouter>
  );
}

export default App;

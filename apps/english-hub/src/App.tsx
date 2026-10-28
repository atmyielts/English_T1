import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { HubFrame, SkillWorkspace } from './app/Chrome';
import { useEnglish } from './app/EnglishContext';
import { OfflineBanner } from './components/OfflineBanner';
import { OfflineSync } from './components/offline/OfflineSync';
import { UpdatePrompt } from './components/InstallApp';
import { applyManifest } from './lib/pwa';
import { useT } from './i18n';
import { SKILLS, skillByKey } from './lib/skills';
import { Loading } from './ui/kit';
import { LandingPage } from './pages/LandingPage';
import { TodayPage } from './pages/TodayPage';
import { CheckPage } from './pages/CheckPage';

const PracticePage = lazy(() => import('./pages/PracticePage').then((m) => ({ default: m.PracticePage })));
const ReviewPage = lazy(() => import('./pages/ReviewPage').then((m) => ({ default: m.ReviewPage })));
const ProgressPage = lazy(() => import('./pages/ProgressPage').then((m) => ({ default: m.ProgressPage })));
const TutorPage = lazy(() => import('./pages/TutorPage').then((m) => ({ default: m.TutorPage })));
const LeaguePage = lazy(() => import('./pages/LeaguePage').then((m) => ({ default: m.LeaguePage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const CertificatePage = lazy(() => import('./pages/CertificatePage').then((m) => ({ default: m.CertificatePage })));
const PublicCertificatePage = lazy(() => import('./pages/PublicCertificatePage').then((m) => ({ default: m.PublicCertificatePage })));
const RolePlaysPage = lazy(() => import('./pages/RolePlaysPage').then((m) => ({ default: m.RolePlaysPage })));
const RolePlayPage = lazy(() => import('./pages/RolePlaysPage').then((m) => ({ default: m.RolePlayPage })));
const ClassesPage = lazy(() => import('./pages/ClassesPage').then((m) => ({ default: m.ClassesPage })));
const ClassDashboardPage = lazy(() => import('./pages/ClassDashboardPage').then((m) => ({ default: m.ClassDashboardPage })));
const SpeakingMockPage = lazy(() => import('./pages/SpeakingMockPage').then((m) => ({ default: m.SpeakingMockPage })));
const OfflineSessionPage = lazy(() => import('./pages/OfflineSessionPage').then((m) => ({ default: m.OfflineSessionPage })));
const JourneyPage = lazy(() => import('./pages/JourneyPage').then((m) => ({ default: m.JourneyPage })));
const InboxPage = lazy(() => import('./pages/InboxPage').then((m) => ({ default: m.InboxPage })));
const DuelsPage = lazy(() => import('./pages/DuelPage').then((m) => ({ default: m.DuelsPage })));
const DuelPage = lazy(() => import('./pages/DuelPage').then((m) => ({ default: m.DuelPage })));
const PublicProgressPage = lazy(() => import('./pages/PublicProgressPage').then((m) => ({ default: m.PublicProgressPage })));
const ExamPage = lazy(() => import('./pages/ExamPage').then((m) => ({ default: m.ExamPage })));
const DailyStoryPage = lazy(() => import('./pages/DailyStoryPage').then((m) => ({ default: m.DailyStoryPage })));

const SKILL_APPS = {
  reading: lazy(() => import('./skills/reading')),
  listening: lazy(() => import('./skills/listening')),
  writing: lazy(() => import('./skills/writing')),
  speaking: lazy(() => import('./skills/speaking')),
  grammar: lazy(() => import('./skills/grammar')),
  vocabulary: lazy(() => import('./skills/vocabulary')),
  immersion: lazy(() => import('./skills/immersion')),
} as const;

const Page = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<section className="en-panel"><Loading lines={6} /></section>}>{children}</Suspense>
);

const Footer = () => {
  const t = useT();
  return (
    <footer className="en-footer">
      <span>© Schood</span>
      <span className="en-row">
        <a href="https://schood.online/contact">{t('footer.help')}</a>
        <a href="https://schood.online/pricing">{t('footer.pricing')}</a>
        <a href="https://schood.online/privacy">{t('footer.privacy')}</a>
      </span>
    </footer>
  );
};

const SignedOutGate = () => {
  const t = useT();
  const { signInHref } = useEnglish();
  const location = useLocation();
  const skill = skillByKey(location.pathname.split('/')[1]);
  return (
    <section className="en-panel" style={{ maxWidth: '44rem', width: '100%', margin: '2rem auto' }}>
      <p className="eyebrow">{t('gate.eyebrow')}</p>
      <h1>{skill ? t('gate.titleSkill', { skill: t(`skill.${skill.key}`) }) : t('gate.title')}</h1>
      <p>{t('gate.body')}</p>
      <div className="en-actions">
        <a className="en-button is-large" href={signInHref(location.pathname + location.search)}>{t('gate.cta')}</a>
        <Link className="en-button-quiet" to="/">{t('gate.home')}</Link>
      </div>
    </section>
  );
};

const App = () => {
  const t = useT();
  const location = useLocation();
  const { sessionResolved, session } = useEnglish();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  // Inside /<skill> the browser offers that skill's own app; elsewhere, Schood English.
  useEffect(() => {
    applyManifest(location.pathname);
  }, [location.pathname]);

  if (!sessionResolved) {
    return <HubFrame><section className="en-panel"><Loading lines={6} label={t('app.restoring')} /></section></HubFrame>;
  }

  if (!session) {
    return (
      <>
        <OfflineBanner />
        <UpdatePrompt />
        <HubFrame>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            {/* A shared certificate link works for anyone. */}
            <Route path="/c/:code" element={<Page><PublicCertificatePage /></Page>} />
            {/* Offline, an expired session cannot be refreshed: saved activities still open. */}
            <Route path="/offline" element={<Page><OfflineSessionPage /></Page>} />
            {/* A parent's or teacher's progress link works for anyone. */}
            <Route path="/p/:token" element={<Page><PublicProgressPage /></Page>} />
            <Route path="*" element={<SignedOutGate />} />
          </Routes>
        </HubFrame>
        <Footer />
      </>
    );
  }

  const hub = (element: ReactNode) => <HubFrame><Page>{element}</Page></HubFrame>;

  return (
    <>
      <OfflineBanner />
      <OfflineSync />
      <UpdatePrompt />
      <Routes>
        <Route path="/" element={<Navigate to="/today" replace />} />
        <Route path="/today" element={<HubFrame><TodayPage /></HubFrame>} />
        <Route path="/practice" element={hub(<PracticePage />)} />
        <Route path="/review" element={hub(<ReviewPage />)} />
        <Route path="/progress" element={hub(<ProgressPage />)} />
        <Route path="/tutor" element={hub(<TutorPage />)} />
        <Route path="/league" element={hub(<LeaguePage />)} />
        <Route path="/settings" element={hub(<SettingsPage />)} />
        <Route path="/check" element={hub(<CheckPage />)} />
        <Route path="/certificate" element={hub(<CertificatePage />)} />
        <Route path="/c/:code" element={hub(<PublicCertificatePage />)} />
        <Route path="/roleplay" element={hub(<RolePlaysPage />)} />
        <Route path="/roleplay/:id" element={hub(<RolePlayPage />)} />
        <Route path="/speaking-mock" element={hub(<SpeakingMockPage />)} />
        <Route path="/classes" element={hub(<ClassesPage />)} />
        <Route path="/classes/:id" element={hub(<ClassDashboardPage />)} />
        <Route path="/offline" element={hub(<OfflineSessionPage />)} />
        <Route path="/journey" element={hub(<JourneyPage />)} />
        <Route path="/inbox" element={hub(<InboxPage />)} />
        <Route path="/duel" element={hub(<DuelsPage />)} />
        <Route path="/duel/:code" element={hub(<DuelPage />)} />
        <Route path="/p/:token" element={hub(<PublicProgressPage />)} />
        <Route path="/exam" element={hub(<ExamPage />)} />
        <Route path="/stories" element={hub(<DailyStoryPage />)} />
        <Route path="/stories/:id" element={hub(<DailyStoryPage />)} />
        {SKILLS.map((skill) => {
          const SkillApp = SKILL_APPS[skill.key];
          return (
            <Route
              key={skill.key}
              path={`${skill.path}/*`}
              element={<SkillWorkspace skill={skill.key}><Page><SkillApp /></Page></SkillWorkspace>}
            />
          );
        })}
        {/* Addresses from the previous version of the hub. */}
        <Route path="/dashboard" element={<Navigate to="/today" replace />} />
        <Route path="/plan" element={<Navigate to="/today" replace />} />
        <Route path="/week" element={<Navigate to="/progress" replace />} />
        <Route path="/weaknesses" element={<Navigate to="/progress" replace />} />
        <Route path="/studio" element={<Navigate to="/tutor" replace />} />
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
    </>
  );
};

export default App;

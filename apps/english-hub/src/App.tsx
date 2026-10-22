import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ServiceHeader } from '../../../packages/service-design/src/ServiceHeader';
import { LocaleSwitcher } from '../../../packages/service-i18n/src/i18n.tsx';
import { useEnglish } from './app/EnglishContext';
import { OfflineBanner } from './components/OfflineBanner';
import { useT } from './i18n';
import { SKILLS, skillByKey } from './lib/skills';
import { Loading } from './ui/kit';
import { LandingPage } from './pages/LandingPage';
import { TodayPage } from './pages/TodayPage';

const PracticePage = lazy(() => import('./pages/PracticePage').then((m) => ({ default: m.PracticePage })));
const ReviewPage = lazy(() => import('./pages/ReviewPage').then((m) => ({ default: m.ReviewPage })));
const ProgressPage = lazy(() => import('./pages/ProgressPage').then((m) => ({ default: m.ProgressPage })));
const TutorPage = lazy(() => import('./pages/TutorPage').then((m) => ({ default: m.TutorPage })));
const SettingsPage = lazy(() => import('./pages/SettingsPage').then((m) => ({ default: m.SettingsPage })));

const SKILL_APPS = {
  reading: lazy(() => import('./skills/reading')),
  listening: lazy(() => import('./skills/listening')),
  writing: lazy(() => import('./skills/writing')),
  speaking: lazy(() => import('./skills/speaking')),
  grammar: lazy(() => import('./skills/grammar')),
  vocabulary: lazy(() => import('./skills/vocabulary')),
  immersion: lazy(() => import('./skills/immersion')),
} as const;

const NAV = [
  { id: 'today', path: '/today' },
  { id: 'practice', path: '/practice' },
  { id: 'review', path: '/review' },
  { id: 'progress', path: '/progress' },
  { id: 'tutor', path: '/tutor' },
] as const;

/** Which top-level section a path belongs to; skill pages live under Practice. */
const sectionFor = (pathname: string): string => {
  const first = pathname.split('/')[1] ?? '';
  if (skillByKey(first)) return 'practice';
  return first || 'today';
};

const Page = ({ children }: { children: ReactNode }) => (
  <Suspense fallback={<Loading lines={6} />}>{children}</Suspense>
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
    <section className="en-panel" style={{ maxWidth: '40rem', margin: '2rem auto' }}>
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
  const navigate = useNavigate();
  const location = useLocation();
  const { sessionResolved, session, signInHref, signOut } = useEnglish();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const signedIn = Boolean(session);
  const active = sectionFor(location.pathname);
  const nav = signedIn
    ? NAV.map((item) => ({ id: item.id, label: t(`nav.${item.id}`), active: active === item.id, onClick: () => navigate(item.path) }))
    : [];

  return (
    <>
      <OfflineBanner />
      <ServiceHeader
        service={t('app.service')}
        nav={nav}
        labels={{ skip: t('nav.skip'), home: t('nav.home'), menu: t('nav.menu'), workspace: t('nav.workspace') }}
      >
        <LocaleSwitcher label={t('settings.language.title')} />
        {signedIn ? (
          <>
            <Link className="en-account" to="/settings">{t('nav.settings')}</Link>
            <button type="button" className="quiet" onClick={() => void signOut()}>{t('nav.signOut')}</button>
          </>
        ) : (
          <a className="en-button" href={signInHref(location.pathname === '/' ? '/today' : location.pathname)}>{t('nav.signIn')}</a>
        )}
      </ServiceHeader>

      <main id="workspace-main" className="en-main">
        {!sessionResolved ? (
          <Loading lines={6} label={t('app.restoring')} />
        ) : !signedIn ? (
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="*" element={<SignedOutGate />} />
          </Routes>
        ) : (
          <Routes>
            <Route path="/" element={<Navigate to="/today" replace />} />
            <Route path="/today" element={<TodayPage />} />
            <Route path="/practice" element={<Page><PracticePage /></Page>} />
            <Route path="/review" element={<Page><ReviewPage /></Page>} />
            <Route path="/progress" element={<Page><ProgressPage /></Page>} />
            <Route path="/tutor" element={<Page><TutorPage /></Page>} />
            <Route path="/settings" element={<Page><SettingsPage /></Page>} />
            {SKILLS.map((skill) => {
              const SkillApp = SKILL_APPS[skill.key];
              return <Route key={skill.key} path={`${skill.path}/*`} element={<Page><SkillApp /></Page>} />;
            })}
            {/* Addresses from the previous version of the hub. */}
            <Route path="/dashboard" element={<Navigate to="/today" replace />} />
            <Route path="/plan" element={<Navigate to="/today" replace />} />
            <Route path="/week" element={<Navigate to="/progress" replace />} />
            <Route path="/weaknesses" element={<Navigate to="/progress" replace />} />
            <Route path="/studio" element={<Navigate to="/tutor" replace />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Routes>
        )}
      </main>
      <Footer />
    </>
  );
};

export default App;

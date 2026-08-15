import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import '../src/index.css';
import '../../english-shared/src/english-routes.css';
import '../src/modules/reading/module.css';
import '../../english-shared/src/workspace-shell.css';
import { EnglishSkillWorkspace, PageHero, SectionGrid } from '../../english-shared/src/ui';

const menuItems = [
  { label: 'Dashboard', href: '/reading/dashboard', active: false },
  { label: 'Library', href: '/reading/library', active: true },
  { label: 'Intensive route', href: '/reading/intensive', active: false },
  { label: 'Report room', href: '/reading/reports', active: false },
];

const switchLinks = ['Writing', 'Listening', 'Speaking', 'Grammar', 'Vocabulary', 'Immersion'].map((label) => ({
  key: label.toLowerCase(),
  label,
  href: `/${label.toLowerCase()}/dashboard`,
}));

const Fixture = () => (
  <div className="hub-root module-host">
    <main className="hub-shell">
      <EnglishSkillWorkspace
        serviceName="English Reading"
        serviceTagline="Read with focus, capture useful language, and carry the result into your next skill."
        menuItems={menuItems}
        serviceSwitchLinks={switchLinks}
        hubHref="/"
        platformHref="#platform"
        pricingHref="#pricing"
        signInHref="#signin"
        status="signed_in"
        needsAccess={false}
        checkingAccess={false}
        accessError={null}
        search=""
        onSearchChange={() => undefined}
        onSignOut={() => undefined}
        upgradeTitle="Premium Reading"
        upgradeCopy="Full article shelves, focused reading routes, and connected feedback."
        updatesHref="#updates"
      >
        <SectionGrid>
          <PageHero
            eyebrow="Article route"
            title="How to Read City Signs Quickly"
            copy="A simple routine to understand common signs, directions, and warning words in busy places."
            actions={
              <>
                <a className="ghost-btn" href="#library">Back to library</a>
                <a className="ghost-btn" href="#intensive">Open intensive route</a>
              </>
            }
          />
          <section className="article-detail-layout">
            <article className="card article-detail-content">
              <div className="article-reading-ribbon">
                <div>
                  <small>Focus mode</small>
                  <strong>Use the paragraph ladder to hold structure while you read.</strong>
                </div>
                <div className="reading-premium-chip-row">
                  <span className="reading-premium-chip muted">Focus mode</span>
                  <span className="reading-premium-chip muted">Margin glossary</span>
                  <span className="reading-premium-chip muted">Summary transfer</span>
                </div>
              </div>
              <h3 className="article-detail-h3">Why city signs matter</h3>
              <p className="article-detail-paragraph">
                <button className="article-paragraph-bead active" type="button">1</button>
                <span className="article-detail-paragraph-text focused">Street signs are short, but they carry important decisions. Read the action word first, then confirm the detail.</span>
              </p>
              <h3 className="article-detail-h3">Three-step scan</h3>
              <p className="article-detail-paragraph">
                <button className="article-paragraph-bead" type="button">2</button>
                <span className="article-detail-paragraph-text">Find the action, check time or distance, and identify whether the sign is an instruction, warning, or information.</span>
              </p>
            </article>
            <aside className="card article-detail-side">
              <h3>Reading panel</h3>
              <div className="article-detail-kv"><span>Read time</span><strong>4 min</strong></div>
              <div className="article-detail-kv"><span>Level</span><strong>A1</strong></div>
              <div className="article-detail-kv"><span>Category</span><strong>Daily life</strong></div>
            </aside>
          </section>
        </SectionGrid>
      </EnglishSkillWorkspace>
    </main>
  </div>
);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MemoryRouter initialEntries={['/reading/library/city-signs-quick-read']}>
      <Fixture />
    </MemoryRouter>
  </React.StrictMode>,
);

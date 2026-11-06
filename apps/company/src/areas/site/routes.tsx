// Public site: landing page, marketing pages and the help centre. Long pages load on first visit.
import React from 'react';
import { LEAD_ROLES } from '../../../../../packages/company-core/src/mod.ts';
import { lazyPage } from '../lazy.ts';
import type { AreaRoute } from '../types.ts';
import { Landing } from './Landing.tsx';
import '../people/people.css';
import './site.css';

const Industries = lazyPage(() => import('./pages/IndustryPages.tsx'), 'IndustriesIndex');
const Industry = lazyPage(() => import('./pages/IndustryPages.tsx'), 'IndustryPage');
const Solutions = lazyPage(() => import('./pages/SolutionPages.tsx'), 'SolutionsIndex');
const Solution = lazyPage(() => import('./pages/SolutionPages.tsx'), 'SolutionPage');
const Check = lazyPage(() => import('./pages/CheckPage.tsx'), 'CheckPage');
const Guide = lazyPage(() => import('./pages/GuidePages.tsx'), 'GuidePage');
const GuideRole = lazyPage(() => import('./pages/GuidePages.tsx'), 'GuideRolePage');
const Calculator = lazyPage(() => import('./pages/CalculatorPage.tsx'), 'CalculatorPage');
const SampleReportPage = lazyPage(() => import('./pages/SampleReportPage.tsx'), 'SampleReportPage');
const Help = lazyPage(() => import('./pages/HelpPages.tsx'), 'HelpPage');
const HelpArticle = lazyPage(() => import('./pages/HelpPages.tsx'), 'HelpArticlePage');
const WorkspaceHelp = lazyPage(() => import('./pages/HelpPages.tsx'), 'WorkspaceHelpPage');
const WorkspaceHelpArticle = lazyPage(() => import('./pages/HelpPages.tsx'), 'WorkspaceHelpArticlePage');
const Compare = lazyPage(() => import('./pages/ComparePage.tsx'), 'ComparePage');
const Legal = lazyPage(() => import('./pages/LegalPages.tsx'), 'LegalPage');
const Thanks = lazyPage(() => import('./pages/ThanksPage.tsx'), 'ThanksPage');

const page = (path: string, render: AreaRoute['render']): AreaRoute => ({ path, access: 'public', bare: true, render });
const helpHome = () => <WorkspaceHelp/>;

export const routes: AreaRoute[] = [
  page('/', () => <Landing/>),
  page('/for', () => <Industries/>),
  page('/for/:industry', ({ industry }) => <Industry key={industry} slug={industry}/>),
  page('/solutions', () => <Solutions/>),
  page('/solutions/:solution', ({ solution }) => <Solution key={solution} slug={solution}/>),
  page('/check', () => <Check/>),
  page('/guide', () => <Guide/>),
  page('/guide/:role', ({ role }) => <GuideRole key={role} slug={role}/>),
  page('/calculator', () => <Calculator/>),
  page('/sample-report', () => <SampleReportPage/>),
  page('/help', () => <Help/>),
  page('/help/:article', ({ article }) => <HelpArticle key={article} id={article}/>),
  page('/compare', () => <Compare/>),
  page('/privacy', () => <Legal key="privacy" kind="privacy"/>),
  page('/terms', () => <Legal key="terms" kind="terms"/>),
  page('/security', () => <Legal key="security" kind="security"/>),
  page('/thanks', () => <Thanks/>),
  // The same articles inside the workspace, in the sidebar: under My English for employees, under Overview for HR and managers.
  { path: '/w/:org/help', access: 'org', render: helpHome },
  { path: '/w/:org/help', access: 'org', roles: LEAD_ROLES, nav: { section: 'overview', label: 'site.nav.help', order: 90 }, render: helpHome },
  { path: '/w/:org/help', access: 'org', roles: ['employee'], nav: { section: 'me', label: 'site.nav.help', order: 99 }, render: helpHome },
  { path: '/w/:org/help/:article', access: 'org', render: ({ article }) => <WorkspaceHelpArticle key={article} id={article}/> },
];

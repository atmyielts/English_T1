// Training pages. Owned by the "training" workstream (docs/product/45_COMPANY_ENGLISH.md §3.2).
import React from 'react';
import { HR_ROLES, LEAD_ROLES } from '../../../../../packages/company-core/src/mod.ts';
import { lazyPage } from '../lazy.ts';
import type { AreaRoute } from '../types.ts';
import './training.css';
import './training2.css';

const Glossary = lazyPage(() => import('./Glossary.tsx'), 'Glossary');
const GlossaryAdmin = lazyPage(() => import('./GlossaryAdmin.tsx'), 'GlossaryAdmin');
const LessonPlayer = lazyPage(() => import('./LessonPlayer.tsx'), 'LessonPlayer');
const Lessons = lazyPage(() => import('./Lessons.tsx'), 'Lessons');
const MyEnglish = lazyPage(() => import('./MyEnglish.tsx'), 'MyEnglish');
const RoleplayHome = lazyPage(() => import('./Roleplay.tsx'), 'RoleplayHome');
const RoleplaySession = lazyPage(() => import('./Roleplay.tsx'), 'RoleplaySession');
const TrainingPlan = lazyPage(() => import('./TrainingPlan.tsx'), 'TrainingPlan');
const Writing = lazyPage(() => import('./Writing.tsx'), 'Writing');
const Builder = lazyPage(() => import('./Builder.tsx'), 'Builder');
const LessonEditor = lazyPage(() => import('./LessonEditor.tsx'), 'LessonEditor');
const LessonPreview = lazyPage(() => import('./LessonPlayer.tsx'), 'LessonPreview');
const CourseEditor = lazyPage(() => import('./CourseEditor.tsx'), 'CourseEditor');
const ScenarioEditor = lazyPage(() => import('./ScenarioEditor.tsx'), 'ScenarioEditor');
const MyPath = lazyPage(() => import('./Paths.tsx'), 'MyPath');
const PathsBoard = lazyPage(() => import('./Paths.tsx'), 'PathsBoard');
const PathMember = lazyPage(() => import('./Paths.tsx'), 'PathMember');
const MyCertificates = lazyPage(() => import('./Certificates.tsx'), 'MyCertificates');
const CertificatesAdmin = lazyPage(() => import('./Certificates.tsx'), 'CertificatesAdmin');
const CertificateCheck = lazyPage(() => import('./Certificates.tsx'), 'CertificateCheck');

export const routes: AreaRoute[] = [
  { path: '/w/:org/me', access: 'org', nav: { section: 'me', label: 'training.nav.me', order: 0 }, render: () => <MyEnglish/> },
  { path: '/w/:org/my-path', access: 'org', nav: { section: 'me', label: 'training.nav.myPath', order: 0.5 }, render: () => <MyPath/> },
  { path: '/w/:org/learn', access: 'org', nav: { section: 'me', label: 'training.nav.lessons', order: 1 }, render: () => <Lessons/> },
  { path: '/w/:org/learn/:track/:lesson', access: 'org', render: ({ track, lesson }) => <LessonPlayer track={track} lesson={lesson}/> },
  { path: '/w/:org/roleplay', access: 'org', nav: { section: 'me', label: 'training.nav.roleplay', order: 2 }, render: () => <RoleplayHome/> },
  { path: '/w/:org/roleplay/:session', access: 'org', render: ({ session }) => <RoleplaySession key={session} id={session}/> },
  { path: '/w/:org/writing', access: 'org', nav: { section: 'me', label: 'training.nav.writing', order: 3 }, render: () => <Writing/> },
  { path: '/w/:org/glossary', access: 'org', nav: { section: 'me', label: 'training.nav.glossary', order: 4 }, render: () => <Glossary/> },
  { path: '/w/:org/my-certificates', access: 'org', nav: { section: 'me', label: 'training.nav.myCertificates', order: 5 }, render: () => <MyCertificates/> },
  { path: '/w/:org/training', access: 'org', roles: LEAD_ROLES, nav: { section: 'training', label: 'training.nav.plan', order: 0 }, render: () => <TrainingPlan/> },
  { path: '/w/:org/glossary-admin', access: 'org', roles: HR_ROLES, nav: { section: 'training', label: 'training.nav.glossaryAdmin', order: 4 }, render: () => <GlossaryAdmin/> },
  { path: '/w/:org/builder', access: 'org', roles: HR_ROLES, nav: { section: 'training', label: 'training.nav.builder', order: 1 }, render: () => <Builder/> },
  { path: '/w/:org/builder/lessons/:lesson', access: 'org', roles: HR_ROLES, render: ({ lesson }) => <LessonEditor key={lesson} id={lesson}/> },
  { path: '/w/:org/builder/lessons/:lesson/preview', access: 'org', roles: HR_ROLES, render: ({ lesson }) => <LessonPreview key={lesson} id={lesson}/> },
  { path: '/w/:org/builder/courses/:course', access: 'org', roles: HR_ROLES, render: ({ course }) => <CourseEditor key={course} id={course}/> },
  { path: '/w/:org/builder/scenarios/:scenario', access: 'org', roles: HR_ROLES, render: ({ scenario }) => <ScenarioEditor key={scenario} id={scenario}/> },
  { path: '/w/:org/paths', access: 'org', roles: LEAD_ROLES, nav: { section: 'training', label: 'training.nav.paths', order: 2 }, render: () => <PathsBoard/> },
  { path: '/w/:org/paths/:member', access: 'org', roles: LEAD_ROLES, render: ({ member }) => <PathMember key={member} id={member}/> },
  { path: '/w/:org/certificates', access: 'org', roles: LEAD_ROLES, nav: { section: 'training', label: 'training.nav.certificates', order: 3 }, render: () => <CertificatesAdmin/> },
  { path: '/c/:code', access: 'public', render: ({ code }) => <CertificateCheck key={code} code={code}/> },
];

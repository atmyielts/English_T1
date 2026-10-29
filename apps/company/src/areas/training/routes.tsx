// Training pages. Owned by the "training" workstream (docs/product/45_COMPANY_ENGLISH.md §3.2).
import React from 'react';
import { HR_ROLES, LEAD_ROLES } from '../../../../../packages/company-core/src/mod.ts';
import type { AreaRoute } from '../types.ts';
import { Glossary } from './Glossary.tsx';
import { GlossaryAdmin } from './GlossaryAdmin.tsx';
import { LessonPlayer } from './LessonPlayer.tsx';
import { Lessons } from './Lessons.tsx';
import { MyEnglish } from './MyEnglish.tsx';
import { RoleplayHome, RoleplaySession } from './Roleplay.tsx';
import { TrainingPlan } from './TrainingPlan.tsx';
import { Writing } from './Writing.tsx';
import './training.css';

export const routes: AreaRoute[] = [
  { path: '/w/:org/me', access: 'org', nav: { section: 'me', label: 'training.nav.me', order: 0 }, render: () => <MyEnglish/> },
  { path: '/w/:org/learn', access: 'org', nav: { section: 'me', label: 'training.nav.lessons', order: 1 }, render: () => <Lessons/> },
  { path: '/w/:org/learn/:track/:lesson', access: 'org', render: ({ track, lesson }) => <LessonPlayer track={track} lesson={lesson}/> },
  { path: '/w/:org/roleplay', access: 'org', nav: { section: 'me', label: 'training.nav.roleplay', order: 2 }, render: () => <RoleplayHome/> },
  { path: '/w/:org/roleplay/:session', access: 'org', render: ({ session }) => <RoleplaySession key={session} id={session}/> },
  { path: '/w/:org/writing', access: 'org', nav: { section: 'me', label: 'training.nav.writing', order: 3 }, render: () => <Writing/> },
  { path: '/w/:org/glossary', access: 'org', nav: { section: 'me', label: 'training.nav.glossary', order: 4 }, render: () => <Glossary/> },
  { path: '/w/:org/training', access: 'org', roles: LEAD_ROLES, nav: { section: 'training', label: 'training.nav.plan', order: 0 }, render: () => <TrainingPlan/> },
  { path: '/w/:org/glossary-admin', access: 'org', roles: HR_ROLES, nav: { section: 'training', label: 'training.nav.glossaryAdmin', order: 1 }, render: () => <GlossaryAdmin/> },
];

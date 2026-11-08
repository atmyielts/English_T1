// Connect pages. Notifications are everyone's; the rest is for HR.
import React from 'react';
import { HR_ROLES } from '../../../../../packages/company-core/src/mod.ts';
import { lazyPage } from '../lazy.ts';
import type { AreaRoute } from '../types.ts';
import './connect.css';

const NotificationsPage = lazyPage(() => import('./NotificationsPage.tsx'), 'NotificationsPage');
const HubPage = lazyPage(() => import('./HubPage.tsx'), 'HubPage');
const ApiPage = lazyPage(() => import('./ApiPage.tsx'), 'ApiPage');
const WebhooksPage = lazyPage(() => import('./WebhooksPage.tsx'), 'WebhooksPage');
const ImportPage = lazyPage(() => import('./ImportPage.tsx'), 'ImportPage');
const BrandPage = lazyPage(() => import('./BrandPage.tsx'), 'BrandPage');
const PrivacyPage = lazyPage(() => import('./PrivacyPage.tsx'), 'PrivacyPage');
const AuditPage = lazyPage(() => import('./AuditPage.tsx'), 'AuditPage');

export const routes: AreaRoute[] = [
  { path: '/w/:org/notifications', access: 'org', nav: { section: 'connect', label: 'connect.nav.notifications', order: 0 }, render: () => <NotificationsPage/> },
  { path: '/w/:org/connect', access: 'org', roles: HR_ROLES, nav: { section: 'connect', label: 'connect.nav.hub', order: 10 }, render: () => <HubPage/> },
  { path: '/w/:org/connect/import', access: 'org', roles: HR_ROLES, nav: { section: 'connect', label: 'connect.nav.import', order: 20 }, render: () => <ImportPage/> },
  { path: '/w/:org/connect/api', access: 'org', roles: HR_ROLES, nav: { section: 'connect', label: 'connect.nav.api', order: 30 }, render: () => <ApiPage/> },
  { path: '/w/:org/connect/webhooks', access: 'org', roles: HR_ROLES, nav: { section: 'connect', label: 'connect.nav.webhooks', order: 40 }, render: () => <WebhooksPage/> },
  { path: '/w/:org/connect/brand', access: 'org', roles: HR_ROLES, nav: { section: 'connect', label: 'connect.nav.brand', order: 50 }, render: () => <BrandPage/> },
  { path: '/w/:org/connect/privacy', access: 'org', roles: HR_ROLES, nav: { section: 'connect', label: 'connect.nav.privacy', order: 60 }, render: () => <PrivacyPage/> },
  { path: '/w/:org/connect/audit', access: 'org', roles: HR_ROLES, nav: { section: 'connect', label: 'connect.nav.audit', order: 70 }, render: () => <AuditPage/> },
];

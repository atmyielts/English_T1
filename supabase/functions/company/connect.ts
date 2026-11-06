// Connect routes: notifications, reminders, API keys and public API, webhooks, HRIS
// import, white label and privacy tools. Other areas may call pushNotice, emitEvent and
// publicBrand from here.
import type { Route } from './types.ts';
import { publicApiRoutes } from './connect/api.ts';
import { apiKeyRoutes } from './connect/apikeys.ts';
import { brandRoutes } from './connect/brand.ts';
import { importRoutes } from './connect/import.ts';
import { emailRoutes } from './connect/invite-email.ts';
import { jobRoutes } from './connect/job.ts';
import { noticeRoutes } from './connect/notices.ts';
import { overviewRoutes } from './connect/overview.ts';
import { privacyRoutes } from './connect/privacy.ts';
import { telegramRoutes } from './connect/telegram.ts';
import { webhookRoutes } from './connect/webhooks.ts';

export { pushNotice, pushNotices, type NoticeInput } from './connect/notices.ts';
export { emitEvent, WEBHOOK_EVENTS } from './connect/webhooks.ts';
export { brandOf, publicBrand, type Brand } from './connect/brand.ts';
export type { ConnectConfig } from './connect/shared.ts';

export const routes: Route[] = [...noticeRoutes, ...telegramRoutes, ...emailRoutes, ...overviewRoutes, ...apiKeyRoutes, ...publicApiRoutes, ...webhookRoutes, ...importRoutes, ...brandRoutes, ...privacyRoutes, ...jobRoutes];

import { libraryRoutes } from '../library.ts';
import type { FeatureModule } from '../types.ts';
import { registerAssistant } from './assistant.ts';
import { chat } from './chat.ts';
import { registerLearnerProfile } from './profile.ts';
import { actions, context, credits, generations, history, me, messages, notifyPrefs, report, settings, threads } from './routes.ts';
import { specialists } from './specialists.ts';

registerAssistant();
registerLearnerProfile();

export const coreModule: FeatureModule = {
  area: 'core',
  routes: {
    me: { GET: me, service: true },
    chat: { POST: chat, maxBody: 48 * 1024, service: true },
    threads: { ...threads, service: true },
    history,
    // The caller's own notification choices (also from the Telegram bots).
    'notify-prefs': { ...notifyPrefs, service: true },
    messages: { GET: messages, service: true },
    credits: { ...credits, service: true },
    actions,
    report: { POST: report },
    settings,
    generations,
    context: { GET: context },
    // Owners and admins tailor the assistants (overrides and custom ones).
    specialists,
    // The library (T6): see library.ts and CONTRACT.md.
    ...libraryRoutes,
  },
};

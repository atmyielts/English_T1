import { libraryRoutes } from '../library.ts';
import type { FeatureModule } from '../types.ts';
import { registerAssistant } from './assistant.ts';
import { chat } from './chat.ts';
import { registerLearnerProfile } from './profile.ts';
import { actions, context, credits, generations, me, messages, report, settings, threads } from './routes.ts';

registerAssistant();
registerLearnerProfile();

export const coreModule: FeatureModule = {
  area: 'core',
  routes: {
    me: { GET: me, service: true },
    chat: { POST: chat, maxBody: 48 * 1024, service: true },
    threads: { ...threads, service: true },
    messages: { GET: messages, service: true },
    credits: { ...credits, service: true },
    actions,
    report: { POST: report },
    settings,
    generations,
    context: { GET: context },
    // The library (T6): see library.ts and CONTRACT.md.
    ...libraryRoutes,
  },
};

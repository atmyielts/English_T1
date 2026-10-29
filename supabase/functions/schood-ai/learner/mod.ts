import type { FeatureModule } from '../types.ts';
import { abroadRoutes } from './abroad.ts';
import { consentRoutes, deleteHistory, home } from './account.ts';
import { briefRoutes } from './brief.ts';
import { duelRoutes } from './duel.ts';
import { explainRoutes } from './explain.ts';
import { familyRoutes, registerFamilyPlanSource } from './family.ts';
import { homeworkRoutes } from './homework.ts';
import { planRoutes } from './plans.ts';
import { pronunciationRoutes } from './pronunciation.ts';
import { speakingRoutes } from './speaking.ts';
import { telegramRoutes } from './telegram.ts';
import { textRoutes } from './texts.ts';
import { registerTutor } from './tutor.ts';
import { writingRoutes } from './writing.ts';

// Learners and parents (L1–L17, P1–P2). See ../CONTRACT.md and
// docs/product/44_SCHOOD_AI.md. L18 (gifts) belongs to the pricing area.
//   L1 tutor: specialist `tutor` (served by core/chat) and its context providers
//   L2 explain*, L3/L11/L8 writing*, essay-*, L4/L12 speaking*, L13 pronunciation*
//   L5/L15 study-plan, gap, L6/L9/L10 words*, photo-*, reading*, L7 homework*
//   L14 brief*, L16 abroad*, L17 duel*, family (Plus Family, P1, P2), consent
//   Telegram: telegram, telegram-brief, brief-sent (the student bot, service secret)

registerTutor();
registerFamilyPlanSource();

export const learnerModule: FeatureModule = {
  area: 'learner',
  routes: {
    home: { GET: home },
    history: { DELETE: deleteHistory },
    ...consentRoutes,
    ...explainRoutes,
    ...writingRoutes,
    ...speakingRoutes,
    ...pronunciationRoutes,
    ...planRoutes,
    ...textRoutes,
    ...homeworkRoutes,
    ...briefRoutes,
    ...abroadRoutes,
    ...duelRoutes,
    ...familyRoutes,
    ...telegramRoutes,
  },
};

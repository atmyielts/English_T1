import { registerSystemJob } from '../registries.ts';
import type { FeatureModule } from '../types.ts';
import { brand, results, writeBrand } from './brand.ts';
import { CHANNEL_JOB, channels, dispatchRoute, editPost, planWeek, proposeWeek, registerChannelActions, runChannelJob, verifyChannel, writePost } from './channel.ts';
import { academyGroupsRoute, assessmentBanksRoute, exportMaterial, getHandout, registerExportActions, weakSpotsRoute } from './exports.ts';
import { batches, markRecording, markScript, scripts, writeFeedback, writingSignals } from './marking.ts';
import { acquireListing, getListing, moderation, myListings, proposeListing, rateListing, registerMarketActions, searchMarket, withdrawListing } from './market.ts';
import { decideMaterial, registerTeacherKinds } from './library.ts';
import { createMaterial, editMaterial, getMaterial, listMaterialsRoute, recheckMaterial, renameMaterial, stepMaterial } from './materials.ts';
import { answerQuiz, controlQuiz, createQuiz, getQuiz, joinQuiz, listQuizzes, openGameByCode, openGameByPlayer, playQuiz, quizResults } from './quiz.ts';

// Teachers (T1–T6, T9–T15): Materials Studio, checked keys, marking, feedback,
// planner, library adapter, Live Quiz, channel autopilot, marketplace and brand kit.
// Owned by the teacher agent. See ../CONTRACT.md and docs/product/44_SCHOOD_AI.md.

registerTeacherKinds();
registerExportActions();
registerChannelActions();
// T11: core's scheduler sends due channel posts (no route and no cron entry of our own).
registerSystemJob(CHANNEL_JOB.name, { area: 'teacher', schedule: { everyMinutes: CHANNEL_JOB.everyMinutes }, timeoutMs: 90_000, run: runChannelJob });
registerMarketActions();

const IMAGES = 10 * 1024 * 1024;

export const teacherModule: FeatureModule = {
  area: 'teacher',
  routes: {
    // T1, T2, T5, T9, T10 packs: material jobs; approving saves a page to the library (T6).
    materials: { GET: listMaterialsRoute, POST: createMaterial, maxBody: IMAGES },
    material: { GET: getMaterial, PATCH: editMaterial, maxBody: 768 * 1024 },
    'material-step': { POST: stepMaterial, maxBody: IMAGES },
    'material-recheck': { POST: recheckMaterial },
    'material-title': { POST: renameMaterial },
    'material-decide': { POST: decideMaterial },
    // Exports of approved library pages.
    export: { POST: exportMaterial },
    handout: { GET: getHandout },
    'academy-groups': { GET: academyGroupsRoute },
    'weak-spots': { GET: weakSpotsRoute },
    'assessment-banks': { GET: assessmentBanksRoute },
    // T10 Live Quiz.
    quiz: { GET: getQuiz, POST: createQuiz },
    'quiz-control': { POST: controlQuiz },
    'quiz-sessions': { GET: listQuizzes },
    'quiz-results': { GET: quizResults },
    'quiz-join': { POST: joinQuiz },
    'quiz-play': { POST: playQuiz },
    'quiz-answer': { POST: answerQuiz },
    // The same game without signing in. Limits count per open game (rateKey), so a
    // class behind one school address plays without lag, under a per-IP ceiling; a
    // made-up code or token has no game and is limited per IP at the same rates.
    'quiz-join-open': { POST: joinQuiz, anonymous: { perMinute: 300, perDay: 5_000, rateKey: openGameByCode } },
    'quiz-play-open': { POST: playQuiz, anonymous: { perMinute: 3_000, perDay: 300_000, ipLimit: { perMinute: 6_000, perDay: 2_000_000 }, rateKey: openGameByPlayer } },
    'quiz-answer-open': { POST: answerQuiz, anonymous: { perMinute: 1_000, perDay: 50_000, ipLimit: { perMinute: 3_000, perDay: 300_000 }, rateKey: openGameByPlayer } },
    // T3, T14, T15 marking; T4 feedback.
    marking: { ...batches },
    'marking-script': { ...scripts },
    'marking-run': { POST: markScript, maxBody: IMAGES },
    'marking-audio': { POST: markRecording, maxBody: 10 * 1024 * 1024 + 8192 },
    'marking-signals': { POST: writingSignals },
    feedback: { POST: writeFeedback },
    // T11 channel autopilot.
    channels: { ...channels },
    'channel-verify': { POST: verifyChannel },
    'channel-week': { POST: planWeek },
    'channel-post-write': { POST: writePost },
    'channel-post': { PATCH: editPost },
    'channel-approve': { POST: proposeWeek },
    'channel-dispatch': { POST: dispatchRoute },
    // T12 marketplace.
    market: { GET: searchMarket },
    'market-listing': { GET: getListing },
    'market-acquire': { POST: acquireListing },
    'market-rate': { POST: rateListing },
    'market-list': { POST: proposeListing },
    'market-mine': { GET: myListings },
    'market-withdraw': { POST: withdrawListing },
    'market-moderation': { ...moderation },
    // T13 brand kit.
    brand: { ...brand },
    'brand-results': { ...results },
    'brand-write': { POST: writeBrand },
  },
};

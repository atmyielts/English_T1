// Core registers its general assistant first, so it stays first in every list of assistants.
import '../core/mod.ts';
import type { FeatureModule } from '../types.ts';
import { admin, audit, grants, retentionNow, usage } from './admin.ts';
import { admissions, admissionsBot, bookings, staffCode, staffReply, threads } from './admissions.ts';
import { myClasses, registerCentreAssistants, studentAssistant } from './assistants.ts';
import { brief } from './brief.ts';
import { byok } from './byok.ts';
import { curricula, publish, registerCurriculumActions, retryUnit, reviewUnit, run } from './curriculum.ts';
import { embed } from './embed.ts';
import { assignmentRules, groupMembers, groups, syncGroups } from './groups.ts';
import { insights } from './insights.ts';
import { ask, knowledge } from './knowledge.ts';
import { marketing, results } from './marketing.ts';
import { campaignDraft, campaigns, leadDraft, leads, parentDraft, registerMessageActions } from './messages.ts';
import { observations, progress, standards } from './observations.ts';
import { botWebhook, embedChat, embedConfig, embedPlacement, embedPoll, systemBrief, systemDaily } from './public.ts';
import { answer, attempts, available, draftReview, generate, mark, registerPlacementKind, review, start, submit, takerTest, tests } from './placement.ts';
import { resell, resellStudents, wholesale } from './resell.ts';
import { academies, budgets, create, invitePreview, invites, join, leave, members, overview, snapshotNow } from './workspace.ts';

// Centres (T7, T8, C1–C16): centre workspace and admin, Student Assistant, teacher
// assistant, office, marketing, placement, insights, admissions agent, resale,
// owner brief, campaigns, curriculum, knowledge, white label and embed, own model
// keys and lesson observation. See README.md in this folder and ../CONTRACT.md.
// Public routes (the centre's Telegram bot, website widgets, the scheduler) are in
// public.ts, mounted in front of the signed-in router.

registerCentreAssistants();
registerMessageActions();
registerCurriculumActions();
registerPlacementKind();

export const centreModule: FeatureModule = {
  area: 'centre',
  routes: {
    // C1 workspace, members, invites, budgets (C7)
    academies: { GET: academies },
    create: { POST: create },
    overview: { GET: overview },
    snapshot: { POST: snapshotNow },
    members,
    leave: { POST: leave },
    budgets: { POST: budgets },
    invites,
    join: { POST: join },
    'invite-preview': { GET: invitePreview },
    // C2 groups and Student Assistant rules; T7 classes
    groups,
    'group-members': { PUT: groupMembers },
    'groups-sync': { POST: syncGroups },
    'assignment-rules': assignmentRules,
    'my-classes': { GET: myClasses },
    'student-assistant': { GET: studentAssistant, service: true },
    // T8 parent messages, C3 office, C11 campaigns
    'parent-draft': { POST: parentDraft },
    leads: { GET: leads },
    'lead-draft': { POST: leadDraft },
    campaigns,
    'campaign-draft': { POST: campaignDraft },
    // C4 marketing
    results,
    marketing: { POST: marketing },
    // C5 placement
    'placement-tests': { ...tests, maxBody: 256 * 1024 },
    'placement-test': { GET: takerTest },
    'placement-start': { POST: start },
    'placement-answer': { POST: answer },
    'placement-submit': { POST: submit },
    'placement-mark': { POST: mark },
    'placement-review': { POST: review },
    'placement-attempts': { GET: attempts },
    'placement-available': { GET: available },
    'placement-generate': { POST: generate },
    'placement-draft-review': { GET: draftReview },
    // C6 insights
    insights,
    // C7 admin
    admin,
    grants: { PATCH: grants },
    audit: { GET: audit },
    usage: { GET: usage },
    'retention-run': { POST: retentionNow },
    // C8 admissions agent
    admissions: { ...admissions, maxBody: 128 * 1024 },
    'admissions-bot': admissionsBot,
    'admissions-staff-code': { POST: staffCode },
    'admissions-threads': threads,
    'admissions-reply': { POST: staffReply },
    bookings,
    // C9 resale, C10 brief
    resell,
    'resell-students': { POST: resellStudents },
    wholesale: { PATCH: wholesale },
    brief,
    // C13 knowledge, C14 embed, C15 own keys, C16 observations, C12 curriculum
    knowledge: { ...knowledge, maxBody: 8 * 1024 * 1024 },
    'knowledge-ask': { POST: ask },
    embed,
    byok,
    'observation-standards': standards,
    observations: { ...observations, maxBody: 96 * 1024 },
    'observation-progress': { GET: progress },
    curricula,
    'curriculum-run': { POST: run },
    'curriculum-retry': { POST: retryUnit },
    'curriculum-review': { POST: reviewUnit },
    'curriculum-publish': { POST: publish },
    // Nobody signed in (public.ts). The centre's own bot: Telegram's servers are few
    // addresses for every centre, so their limit is the highest core allows.
    'bot-webhook': { POST: botWebhook, anonymous: { perMinute: 600, perDay: 100_000 } },
    // Website widgets, through /embed/bridge.html on ai.schood.online.
    'embed-config': { GET: embedConfig, anonymous: { perMinute: 30, perDay: 2_000 } },
    'embed-chat': { POST: embedChat, anonymous: { perMinute: 12, perDay: 400 } },
    'embed-poll': { POST: embedPoll, anonymous: { perMinute: 12, perDay: 3_000 } },
    'embed-placement': { POST: embedPlacement, anonymous: { perMinute: 30, perDay: 600 } },
    // Scheduled by pg_cron in the centre migration (invoke_schood_ai_system).
    'system-brief': { POST: systemBrief, system: true },
    'system-daily': { POST: systemDaily, system: true },
  },
};

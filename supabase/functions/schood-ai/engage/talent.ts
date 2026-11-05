import { switchState } from '../../../../packages/ai-core/src/mod.ts';
import { bool, oneOf, optionalText, optionalUuid, record, stringList, text, uuid } from '../input.ts';
import type { RequestContext } from '../types.ts';
import { begin, refuse, requireSchoodAdmin, type Engage } from './base.ts';
import { isAdult, isRegion, REGIONS } from './rules.ts';

// E13 Talent pool (later stage; ships switched off). Learners who opt in can be found
// by employers, universities and centres through their Skill Passport.
//   - Consent is explicit, versioned and can be withdrawn at any time, even while the
//     pool is switched off. Withdrawal removes the person from every search at once.
//   - The switch is the core admin console's `engage.talent_pool`; off until set to on.
//   - Never minors: only people who told us a birth date 18 or more years ago, checked
//     again at every search. Unknown age means not eligible.
//   - Employers are granted by a Schood admin under a contract. Every search and every
//     profile view is written to an audit trail, and the learner sees who found them.
//   - An employer sees a headline, skills, regions and the Passport items behind the
//     link the learner chose. Never an id, an email or a phone number.

export const CONSENT_VERSION = 'talent-2026-10';
export const TALENT_SKILLS = ['english_speaking', 'english_writing', 'ielts', 'sales', 'customer_service', 'public_speaking', 'interviews', 'admission_maths'] as const;
export const OPEN_TO = ['job', 'internship', 'university', 'centre'] as const;

/**
 * The pool is on only when a Schood admin set the core switch `engage.talent_pool` to on in
 * the admin console. Core switches are on unless listed; this one is off unless listed as on.
 */
export const TALENT_SWITCH = 'engage.talent_pool';
async function enabled(e: Engage) { return switchState((await e.ctx.repo.settings()).features, TALENT_SWITCH) === true; }
async function activeEmployer(e: Engage) {
  const row = await e.b.repo.talentEmployer(e.userId);
  return row && (!row.activeUntil || Date.parse(row.activeUntil) > e.now.getTime()) ? row : null;
}

export async function getTalent(ctx: RequestContext) {
  await ctx.requireFeature('E13');
  const e = await begin(ctx);
  const [on, profile, employer, seen] = await Promise.all([enabled(e), e.b.repo.talentProfile(e.userId), activeEmployer(e), e.b.repo.talentSeenBy(e.userId, 20)]);
  const organisations = new Map<string, string>();
  for (const row of seen) if (!organisations.has(row.employerId)) organisations.set(row.employerId, (await e.b.repo.talentEmployer(row.employerId))?.organisation ?? '');
  return {
    enabled: on, consent_version: CONSENT_VERSION, eligible: isAdult(e.profile, e.today), age_known: !!e.profile.birthDate,
    skills: TALENT_SKILLS, open_to: OPEN_TO, regions: REGIONS,
    profile: profile ? {
      opted_in: !!profile.consentedAt && !profile.withdrawnAt, consented_at: profile.consentedAt, withdrawn_at: profile.withdrawnAt, consent_version: profile.consentVersion,
      headline: profile.headline, skills: profile.skills, open_to: profile.openTo, regions: profile.regions, passport_link_id: profile.passportLinkId,
    } : null,
    seen_by: seen.map((row) => ({ organisation: organisations.get(row.employerId) ?? '', action: row.action, at: row.createdAt })),
    employer: employer ? { organisation: employer.organisation, kind: employer.kind, active_until: employer.activeUntil } : null,
  };
}

export async function consentTalent(ctx: RequestContext) {
  await ctx.requireFeature('E13');
  const e = await begin(ctx);
  if (!(await enabled(e))) refuse('feature_off', 'The talent pool is not open yet.', 409);
  if (!isAdult(e.profile, e.today)) refuse('adults_only', 'The talent pool is for people aged 18 and over who have told us their date of birth.', 403);
  const body = record(await ctx.body());
  if (!bool(body.consent, 'consent') || body.version !== CONSENT_VERSION) refuse('consent_required', 'Read and accept the current consent text.', 400, { version: CONSENT_VERSION });
  const current = await e.b.repo.talentProfile(e.userId);
  const key = current?.candidateKey ?? crypto.randomUUID().replace(/-/g, '').slice(0, 24);
  await e.b.repo.saveTalentProfile(e.userId, { candidateKey: key, consentVersion: CONSENT_VERSION, consentedAt: e.now.toISOString(), withdrawnAt: null });
  await ctx.audit('engage.talent_consent', { version: CONSENT_VERSION });
  return await getTalent(ctx);
}

/** Always available, even when the pool is switched off. */
export async function withdrawTalent(ctx: RequestContext) {
  const e = await begin(ctx);
  const current = await e.b.repo.talentProfile(e.userId);
  if (current?.consentedAt && !current.withdrawnAt) {
    await e.b.repo.saveTalentProfile(e.userId, { withdrawnAt: e.now.toISOString() });
    await ctx.audit('engage.talent_withdraw', {});
  }
  return await getTalent(ctx);
}

export async function saveTalentProfile(ctx: RequestContext) {
  await ctx.requireFeature('E13');
  const e = await begin(ctx);
  if (!(await enabled(e))) refuse('feature_off', 'The talent pool is not open yet.', 409);
  const current = await e.b.repo.talentProfile(e.userId);
  if (!current?.consentedAt || current.withdrawnAt) refuse('consent_required', 'Opt in first.', 409, { version: CONSENT_VERSION });
  const body = record(await ctx.body());
  const linkId = optionalUuid(body.passport_link_id, 'passport_link_id');
  if (linkId) {
    const link = (await e.b.repo.passportLinks(e.userId)).find((entry) => entry.id === linkId);
    if (!link || link.revokedAt) refuse('invalid_request', 'Choose one of your active Passport links.', 400, { field: 'passport_link_id' });
  }
  const regions = stringList(body.regions ?? [], 'regions', { max: 5, pattern: /^[a-z_]{2,20}$/ });
  if (!regions.every(isRegion)) refuse('invalid_request', 'regions has an unknown region.', 400, { field: 'regions' });
  await e.b.repo.saveTalentProfile(e.userId, {
    headline: optionalText(body.headline, 'headline', { max: 140 }),
    skills: stringList(body.skills ?? [], 'skills', { max: 8, pattern: new RegExp(`^(${TALENT_SKILLS.join('|')})$`) }),
    openTo: stringList(body.open_to ?? [], 'open_to', { max: 4, pattern: new RegExp(`^(${OPEN_TO.join('|')})$`) }),
    regions, passportLinkId: linkId,
  });
  return await getTalent(ctx);
}

// --- Employers --------------------------------------------------------------------------------------
async function requireEmployer(e: Engage) {
  if (!(await enabled(e))) refuse('feature_off', 'The talent pool is not open yet.', 409);
  return await activeEmployer(e) ?? refuse('employer_required', 'Talent search is for employers, universities and centres under a Schood agreement.', 403);
}

export async function searchTalent(ctx: RequestContext) {
  const e = await begin(ctx);
  const employer = await requireEmployer(e);
  const skill = ctx.query.get('skill') || undefined, region = ctx.query.get('region') || undefined, openTo = ctx.query.get('open_to') || undefined;
  if (skill && !(TALENT_SKILLS as readonly string[]).includes(skill)) refuse('invalid_request', 'skill is unknown.', 400, { field: 'skill' });
  if (region && !isRegion(region)) refuse('invalid_request', 'region is unknown.', 400, { field: 'region' });
  if (openTo && !(OPEN_TO as readonly string[]).includes(openTo)) refuse('invalid_request', 'open_to is unknown.', 400, { field: 'open_to' });
  const rows = await e.b.repo.searchTalent({ skill, region, openTo, limit: 200 });
  const profiles = await e.b.repo.profiles(rows.map((row) => row.userId));
  // Minors never appear, whatever the stored consent says: the age is checked again now.
  const adults = rows.filter((row) => row.candidateKey && row.userId !== e.userId && isAdult(profiles.get(row.userId)!, e.today)).slice(0, 50);
  await e.b.repo.addTalentAudit({ employerId: e.userId, action: 'search', query: { skill: skill ?? null, region: region ?? null, open_to: openTo ?? null, results: adults.length, organisation: employer.organisation }, targetUserId: null });
  return { results: adults.map((row) => ({ candidate: row.candidateKey, headline: row.headline, skills: row.skills, open_to: row.openTo, regions: row.regions, has_passport: !!row.passportLinkId })) };
}

export async function viewCandidate(ctx: RequestContext) {
  const e = await begin(ctx);
  await requireEmployer(e);
  const key = ctx.query.get('candidate') ?? '';
  if (!/^[0-9a-f]{24}$/.test(key)) refuse('not_found', 'Candidate not found.', 404);
  const row = await e.b.repo.talentByKey(key);
  if (!row || !row.consentedAt || row.withdrawnAt || !isAdult(await e.b.repo.profile(row.userId), e.today)) refuse('not_found', 'Candidate not found.', 404);
  await e.b.repo.addTalentAudit({ employerId: e.userId, action: 'view', query: { candidate: key }, targetUserId: row!.userId });
  const link = row!.passportLinkId ? (await e.b.repo.passportLinks(row!.userId)).find((entry) => entry.id === row!.passportLinkId && !entry.revokedAt && (!entry.expiresAt || Date.parse(entry.expiresAt) > e.now.getTime())) : null;
  const items = link ? (await e.b.repo.passportItems(row!.userId)).filter((item) => item.shown && link.itemIds.includes(item.id) && item.kind !== 'sample') : [];
  const passport = await e.b.repo.passport(row!.userId);
  return {
    candidate: { key, headline: row!.headline, skills: row!.skills, open_to: row!.openTo, regions: row!.regions, display_name: passport.displayName },
    items: items.map((item) => ({ kind: item.kind, title: item.title, data: item.data, verify_url: item.verifyUrl, verified: item.verified, issued_at: item.issuedAt })),
  };
}

export async function employerAudit(ctx: RequestContext) {
  const e = await begin(ctx);
  await requireEmployer(e);
  return { audit: (await e.b.repo.talentAudit(e.userId, 100)).map((row) => ({ action: row.action, query: row.query, at: row.createdAt })) };
}

// --- Schood admin --------------------------------------------------------------------------------------
export async function grantEmployer(ctx: RequestContext) {
  await requireSchoodAdmin(ctx);
  const e = await begin(ctx, { locale: false });
  const body = record(await ctx.body());
  const until = body.active_until === undefined || body.active_until === null ? null : typeof body.active_until === 'string' && Number.isFinite(Date.parse(body.active_until)) ? new Date(body.active_until).toISOString() : refuse('invalid_request', 'active_until must be a date.', 400, { field: 'active_until' });
  const row = await e.b.repo.saveTalentEmployer({ userId: uuid(body.user_id, 'user_id'), organisation: text(body.organisation, 'organisation', { max: 120 }), kind: oneOf(body.kind, 'kind', ['employer', 'university', 'centre'] as const), grantedBy: e.userId, activeUntil: until });
  await ctx.audit('engage.talent_employer', { organisation: row.organisation, kind: row.kind, active_until: row.activeUntil }, { type: 'user', id: row.userId });
  return { employer: { organisation: row.organisation, kind: row.kind, active_until: row.activeUntil } };
}

import { formatCertificateCode, normalizeCertificateCode } from '../../_shared/english-certificate.ts';
import { bool, integer, optionalText, record, stringList, text, uuid } from '../input.ts';
import type { RequestContext } from '../types.ts';
import { begin, linkToken, nameOf, refuse, sha256, type Engage } from './base.ts';
import { engage } from './binding.ts';
import { examByKey } from './content/certificates.ts';
import { pick } from './content/text.ts';
import { displayName } from './rules.ts';
import { sampleView } from './samples.ts';
import { passportSourceEntries } from './seams.ts';
import type { CertificateRow, PassportItem } from './types.ts';

// E3 Skill Passport: one profile with certificates, levels, verified results and the
// voice and writing samples the person chooses. Private by default: every item
// starts hidden, and a share link shows only the items it was made with. Links can
// be revoked at once and expire if the person wants. Only a hash of a link token is
// stored. The public page (/p/<token>) and certificate checks (/verify/<code>) read
// passport-view and verify, which never return an id, an email or anything not chosen.

export const SITE = 'https://ai.schood.online';
const ENGLISH_HUB = 'https://english.schood.online';
const PLATFORM = 'https://schood.online';
const LINK_DAYS = [7, 30, 90, 365] as const;

const certificateItem = (row: CertificateRow, locale: Engage['locale']) => {
  const exam = examByKey(row.examKey);
  return {
    kind: 'certificate' as const, source: 'engage', sourceRef: `certificate:${row.id}`,
    title: exam ? pick(exam.title, locale) : row.examKey,
    data: { exam: row.examKey, level: row.level, score: row.score, code: formatCertificateCode(row.code), revoked: !!row.revokedAt },
    verifyUrl: `${SITE}/verify/${formatCertificateCode(row.code)}`, verified: !row.revokedAt, issuedAt: row.issuedAt,
  };
};

/** Brings the Passport up to date from engage's own records and every registered source. */
export async function refreshPassport(e: Engage): Promise<void> {
  const upsert = (item: Omit<PassportItem, 'id' | 'createdAt' | 'shown' | 'userId'>) => e.b.repo.upsertPassportItem({ ...item, userId: e.userId });
  for (const row of await e.b.repo.certificates(e.userId)) await upsert(certificateItem(row, 'en'));
  // Verified results: recorded outcomes and scored mocks reported by the areas.
  const events = (await e.b.repo.events(e.userId, new Date(0), e.now, 5000)).filter((event) => event.verified && (event.kind === 'outcome_recorded' || event.kind === 'mock_finished') && event.score !== null);
  for (const event of events.slice(-30)) {
    await upsert({
      kind: 'result', source: 'events', sourceRef: `event:${event.id}`, title: event.skill ?? event.feature,
      data: { feature: event.feature, skill: event.skill, score: event.score, outcome: event.outcome, kind: event.kind, national_mock: event.ref?.startsWith('national_mock:') ?? false },
      verifyUrl: null, verified: true, issuedAt: event.createdAt,
    });
  }
  for (const [name, source] of passportSourceEntries()) {
    const items = await source(e.ctx, e.userId).catch((cause) => { console.error(JSON.stringify({ event: 'engage_passport_source_failed', source: name, error: String(cause).slice(0, 200) })); return []; });
    for (const item of items.slice(0, 100)) await upsert({ kind: item.kind, source: name, sourceRef: item.ref, title: item.title.slice(0, 120), data: item.data, verifyUrl: item.verifyUrl, verified: item.verified, issuedAt: item.issuedAt });
  }
}

/** Records the person already holds elsewhere on Schood, read with their own token. */
async function importExternal(e: Engage): Promise<{ hub: number; platform: number }> {
  let hub = 0, platform = 0;
  const english = await e.ctx.functions.call<{ certificates?: { code: string; display_name: string; overall: string; per_skill: Record<string, string>; measured_by: string; measured_at: string; issued_at: string; revoked_at?: string | null }[] }>('hub', '/certificates', { timeoutMs: 6_000 }).catch(() => null);
  for (const row of english?.certificates ?? []) {
    if (row.revoked_at) continue;
    const code = normalizeCertificateCode(row.code);
    if (!code) continue;
    await e.b.repo.upsertPassportItem({
      userId: e.userId, kind: 'level', source: 'hub', sourceRef: `english:${code}`, title: `English ${row.overall}`,
      data: { level: row.overall, per_skill: row.per_skill, measured_by: row.measured_by, measured_at: row.measured_at, code: formatCertificateCode(code) },
      verifyUrl: `${ENGLISH_HUB}/c/${formatCertificateCode(code)}`, verified: true, issuedAt: row.issued_at,
    });
    hub += 1;
  }
  const issued = await e.ctx.functions.call<{ certificates?: { id: string; public_token: string; exam_type: string; overall_band: number | null; overall_score: number | null; exam_date: string | null; issued_at: string; expires_at: string | null }[] }>('certificates', '', { query: { action: 'list' }, timeoutMs: 6_000 }).catch(() => null);
  for (const row of issued?.certificates ?? []) {
    if (!/^[0-9a-f]{32,64}$/i.test(row.public_token ?? '')) continue;
    await e.b.repo.upsertPassportItem({
      userId: e.userId, kind: 'certificate', source: 'platform', sourceRef: `issued:${row.id}`, title: `${String(row.exam_type).toUpperCase()} mock certificate`,
      // Shown as "issued on schood.online", not as verified: these records can be issued without a proctored sitting.
      data: { exam: row.exam_type, band: row.overall_band, score: row.overall_score, exam_date: row.exam_date },
      verifyUrl: `${PLATFORM}/certificate?token=${row.public_token}`, verified: false, issuedAt: row.issued_at,
    });
    platform += 1;
  }
  return { hub, platform };
}

const itemView = (item: PassportItem) => ({
  id: item.id, kind: item.kind, source: item.source, title: item.title, data: item.data, verify_url: item.verifyUrl, verified: item.verified, shown: item.shown, issued_at: item.issuedAt,
});
const linkView = (link: { id: string; label: string; itemIds: string[]; createdAt: string; expiresAt: string | null; revokedAt: string | null; views: number; lastViewedAt: string | null }, now: Date) => ({
  id: link.id, label: link.label, items: link.itemIds.length, created_at: link.createdAt, expires_at: link.expiresAt, revoked: !!link.revokedAt,
  expired: !!link.expiresAt && Date.parse(link.expiresAt) < now.getTime(), views: link.views, last_viewed_at: link.lastViewedAt,
});

async function ownView(e: Engage) {
  const [passport, items, links, samples, name] = await Promise.all([e.b.repo.passport(e.userId), e.b.repo.passportItems(e.userId), e.b.repo.passportLinks(e.userId), e.b.repo.samples(e.userId), nameOf(e.ctx, e.userId)]);
  const sampleItems = new Map(items.filter((item) => item.kind === 'sample').map((item) => [item.sourceRef, item]));
  return {
    passport: { display_name: passport.displayName ?? name, headline: passport.headline, private_by_default: true },
    items: items.filter((item) => item.kind !== 'sample').sort((a, b) => (b.issuedAt ?? '').localeCompare(a.issuedAt ?? '')).map(itemView),
    samples: samples.map((sample) => ({ ...sampleView(sample, false), shown: sampleItems.get(`sample:${sample.id}`)?.shown ?? false, item_id: sampleItems.get(`sample:${sample.id}`)?.id ?? null })),
    links: links.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((link) => linkView(link, e.now)),
  };
}

// --- Routes ----------------------------------------------------------------------------------------------
export async function getPassport(ctx: RequestContext) {
  await ctx.requireFeature('E3');
  const e = await begin(ctx);
  await refreshPassport(e);
  return await ownView(e);
}

export async function importPassport(ctx: RequestContext) {
  await ctx.requireFeature('E3');
  const e = await begin(ctx);
  if (!ctx.user.token) refuse('user_token_required', 'Importing needs you to be signed in on the web.', 409);
  const imported = await importExternal(e);
  await refreshPassport(e);
  return { imported, ...(await ownView(e)) };
}

export async function savePassport(ctx: RequestContext) {
  await ctx.requireFeature('E3');
  const e = await begin(ctx);
  const body = record(await ctx.body());
  const patch: { displayName?: string | null; headline?: string | null } = {};
  if (body.display_name !== undefined) patch.displayName = optionalText(body.display_name, 'display_name', { max: 60 });
  if (body.headline !== undefined) patch.headline = optionalText(body.headline, 'headline', { max: 160 });
  if (patch.displayName && /[<>@]/.test(patch.displayName)) refuse('invalid_request', 'display_name has characters a name cannot have.', 400, { field: 'display_name' });
  await e.b.repo.savePassport(e.userId, patch);
  return await ownView(e);
}

/** Shows or hides an item, or a sample (which becomes an item the first time it is shown). */
export async function showItem(ctx: RequestContext) {
  await ctx.requireFeature('E3');
  const e = await begin(ctx);
  const body = record(await ctx.body());
  const shown = bool(body.shown, 'shown');
  if (body.sample_id !== undefined) {
    const sample = await e.b.repo.sample(uuid(body.sample_id, 'sample_id'));
    if (!sample || sample.userId !== e.userId || sample.deletedAt) refuse('not_found', 'Sample not found.', 404);
    const item = await e.b.repo.upsertPassportItem({ userId: e.userId, kind: 'sample', source: 'engage', sourceRef: `sample:${sample!.id}`, title: sample!.kind === 'voice' ? 'Voice sample' : 'Writing sample', data: { sample_id: sample!.id, kind: sample!.kind, scores: sample!.scores, metrics: sample!.metrics, recorded_at: sample!.recordedAt }, verifyUrl: null, verified: false, issuedAt: sample!.recordedAt });
    await e.b.repo.setItemShown(e.userId, item.id, shown);
  } else {
    const updated = await e.b.repo.setItemShown(e.userId, uuid(body.id, 'id'), shown);
    if (!updated) refuse('not_found', 'Item not found.', 404);
  }
  return await ownView(e);
}

export async function createLink(ctx: RequestContext) {
  await ctx.requireFeature('E3');
  const e = await begin(ctx);
  const body = record(await ctx.body());
  const label = text(body.label, 'label', { max: 60 });
  const requested = stringList(body.item_ids, 'item_ids', { max: 60, pattern: /^[0-9a-f-]{36}$/i });
  const days = body.expires_in_days === undefined || body.expires_in_days === null ? null : integer(body.expires_in_days, 'expires_in_days', 1, 365);
  if (days !== null && !(LINK_DAYS as readonly number[]).includes(days)) refuse('invalid_request', 'expires_in_days must be 7, 30, 90 or 365.', 400, { field: 'expires_in_days' });
  const items = await e.b.repo.passportItems(e.userId);
  const chosen = items.filter((item) => requested.includes(item.id) && item.shown);
  if (!chosen.length) refuse('nothing_to_share', 'Choose at least one item you have set to show.', 400);
  if ((await e.b.repo.passportLinks(e.userId)).filter((link) => !link.revokedAt).length >= 20) refuse('link_limit', 'Revoke an old link first.', 409);
  const token = linkToken();
  const link = await e.b.repo.createPassportLink({ userId: e.userId, tokenHash: await sha256(token), label, itemIds: chosen.map((item) => item.id), expiresAt: days ? new Date(e.now.getTime() + days * 86_400_000).toISOString() : null });
  await ctx.audit('engage.passport_link_created', { items: chosen.length, expires_in_days: days }, { type: 'passport_link', id: link.id });
  // The token is shown once; only its hash is kept.
  return { link: linkView(link, e.now), token, url: `${SITE}/p/${token}`, ...(await ownView(e)) };
}

export async function revokeLink(ctx: RequestContext) {
  await ctx.requireFeature('E3');
  const e = await begin(ctx);
  const body = record(await ctx.body());
  const id = uuid(body.id, 'id');
  if (!(await e.b.repo.revokePassportLink(e.userId, id, e.now.toISOString()))) refuse('not_found', 'Link not found.', 404);
  await ctx.audit('engage.passport_link_revoked', {}, { type: 'passport_link', id });
  return await ownView(e);
}

const TOKEN = /^[A-Za-z0-9_-]{40,60}$/;

/** The live share link for a token: unknown, revoked and expired links are refused alike for samples, told apart for the page. */
export async function liveLink(ctx: RequestContext, token: string | null) {
  if (!token || !TOKEN.test(token)) refuse('not_found', 'This Passport link does not exist.', 404);
  const link = await engage(ctx).repo.passportLinkByHash(await sha256(token!));
  if (!link) refuse('not_found', 'This Passport link does not exist.', 404);
  if (link!.revokedAt) refuse('link_revoked', 'The owner has turned this link off.', 410);
  if (link!.expiresAt && Date.parse(link!.expiresAt) < ctx.now().getTime()) refuse('link_expired', 'This link has expired.', 410);
  return link!;
}

/**
 * What a holder of a share link sees, signed in or not (an anonymous route): only the
 * items and samples the person chose for this link, the name they chose, nothing else.
 */
export async function viewPassport(ctx: RequestContext) {
  const repo = engage(ctx).repo, now = ctx.now();
  const link = await liveLink(ctx, ctx.query.get('token'));
  const [passport, items, name] = await Promise.all([repo.passport(link.userId), repo.passportItems(link.userId), nameOf(ctx, link.userId)]);
  const shown = items.filter((item) => item.shown && link.itemIds.includes(item.id));
  const samples = await Promise.all(shown.filter((item) => item.kind === 'sample').map(async (item) => {
    const sample = await repo.sample(String(item.data.sample_id));
    return sample && !sample.deletedAt && sample.userId === link.userId ? { id: sample.id, kind: sample.kind, recorded_at: sample.recordedAt, scores: sample.scores, metrics: sample.metrics, ...(sample.kind === 'writing' && sample.text ? { text: sample.text } : {}), audio: sample.kind === 'voice' } : null;
  }));
  await repo.touchPassportLink(link.id, now.toISOString());
  return {
    passport: {
      // The name the person chose; otherwise first name and initial, never the full name or an email.
      display_name: passport.displayName ?? displayName('masked', name),
      headline: passport.headline,
      label: link!.label,
    },
    items: shown.filter((item) => item.kind !== 'sample').map((item) => ({ kind: item.kind, source: item.source, title: item.title, data: item.data, verify_url: item.verifyUrl, verified: item.verified, issued_at: item.issuedAt })),
    samples: samples.filter((sample) => !!sample),
  };
}

/** Certificate check by code (the QR on every Skill Certificate), signed in or not. Shows only what the certificate states. */
export async function verifyCertificate(ctx: RequestContext) {
  const code = normalizeCertificateCode(ctx.query.get('code'));
  if (!code) refuse('not_found', 'No certificate has this code.', 404);
  const row = await engage(ctx).repo.certificateByCode(code!);
  if (!row) refuse('not_found', 'No certificate has this code.', 404);
  const exam = examByKey(row!.examKey);
  return {
    certificate: {
      code: formatCertificateCode(row!.code), status: row!.revokedAt ? 'revoked' : 'valid',
      exam: row!.examKey, title: exam ? exam.title : null, level: row!.level, score: row!.score,
      display_name: row!.displayName, issued_at: row!.issuedAt, revoked_at: row!.revokedAt, proctored: true,
    },
  };
}

import { checkMaterial, parseMaterial, studentView, type Block, type Material } from '../../../../packages/ai-core/src/mod.ts';
import { registerActionKind } from '../actions.ts';
import { integer, oneOf, optionalText, record, stringList, text, uuid } from '../input.ts';
import { SchoodAIError, type Locale, type RequestContext } from '../types.ts';
import { teacherDeps } from './deps.ts';
import { actionView } from './views.ts';
import { approvedPage, saveApprovedCopy } from './library.ts';
import type { PageView } from '../library.ts';
import type { Listing, ListingCopy, SellerLedgerRow } from './store.ts';

// T12 materials marketplace: teachers and centres list approved materials; every
// listing passes Approve & run in its own workspace and then Schood's moderation
// queue before anyone sees it. Buyers search, take a copy into their library, rate
// it once they hold it, and every listing shows verified use (distinct workspaces
// that assigned, played, printed or exported a copy).
//
// Money never moves here. Free listings work end to end. Paid listings (priced in
// UZS) and the seller earnings ledger exist, but stay behind the `marketplace_paid`
// switch, which ships off; checkout, the commission rate and payouts are owner
// decisions (docs/product/ai-requests/teacher.md).

/** Schood's commission on paid listings: not decided by the owner yet, so the ledger leaves it empty. */
export const MARKETPLACE_COMMISSION_RATE: number | null = null;
export const PAID_SWITCH = 'marketplace_paid';

const paidEnabled = async (ctx: RequestContext) => (await ctx.repo.settings()).features[PAID_SWITCH] === true;

/** Counts a verified use when the page is a marketplace copy. */
export async function recordListingUse(ctx: RequestContext, page: PageView, kind: 'homework' | 'live_quiz' | 'print' | 'assessment'): Promise<void> {
  try {
    const { store } = await teacherDeps();
    const copy = await store.copyByPage(page.id);
    if (copy && copy.workspaceId === page.workspace_id) await store.recordUse(copy.listingId, copy.workspaceId, kind);
    void ctx;
  } catch (cause) {
    console.error(JSON.stringify({ event: 'schood_ai_listing_use_failed', error: String(cause).slice(0, 200) }));
  }
}

/** What a listing card and page show before buying: the shape and a short excerpt, never the key. */
function preview(material: Record<string, unknown>) {
  let parsed: Material;
  try { parsed = parseMaterial(material); } catch { return null; }
  const student = studentView(parsed);
  const questions = student.blocks.reduce((sum, block) => sum + (block.type === 'questions' ? block.questions.length : 0), 0);
  const first = student.blocks.find((block): block is Extract<Block, { type: 'text' }> => block.type === 'text');
  return {
    blocks: student.blocks.map((block) => block.type), questions, variants: parsed.variants?.length ? 3 : 1, aims: parsed.aims ?? [],
    excerpt: first ? first.body.slice(0, 400) : null,
    sample: student.blocks.filter((block) => block.type === 'questions').slice(0, 1).flatMap((block) => block.type === 'questions' ? block.questions.slice(0, 2).map((question) => ({ prompt: question.prompt.slice(0, 300), options: question.options?.map((option) => option.text.slice(0, 120)) ?? [] })) : []),
  };
}
const card = (listing: Listing) => ({
  id: listing.id, title: listing.title, description: listing.description, kind: listing.kind, level: listing.level, exam: listing.exam, language: listing.language, tags: listing.tags,
  price_uzs: listing.priceUzs, seller_name: listing.sellerName, rating: listing.ratingCount ? Math.round((listing.ratingSum / listing.ratingCount) * 10) / 10 : null, ratings: listing.ratingCount,
  verified_uses: listing.usageCount, copies: listing.copies, status: listing.status, published_at: listing.publishedAt,
});

/** GET teacher/market: search published listings. */
export async function searchMarket(ctx: RequestContext) {
  await ctx.workspace();
  const { store } = await teacherDeps();
  const page = Math.max(0, Math.min(50, Number(ctx.query.get('page') ?? '0') || 0));
  const price = ctx.query.get('price');
  const sort = ctx.query.get('sort');
  const result = await store.searchListings({
    text: (ctx.query.get('q') ?? '').slice(0, 100), kind: ctx.query.get('kind') ?? undefined, level: ctx.query.get('level') ?? undefined, exam: ctx.query.get('exam') ?? undefined,
    language: ctx.query.get('language') ?? undefined, price: price === 'free' || price === 'paid' ? price : 'any', sort: sort === 'usage' || sort === 'new' ? sort : 'rating', limit: 24, offset: page * 24,
  });
  return { listings: result.rows.map(card), total: result.total, page, paid_enabled: await paidEnabled(ctx) };
}

/** GET teacher/market-listing?id= */
export async function getListing(ctx: RequestContext) {
  const access = await ctx.workspace();
  const { store } = await teacherDeps();
  const listing = await store.listing(uuid(ctx.query.get('id'), 'id'));
  const seller = listing && listing.sellerWorkspaceId === access.workspace.id;
  if (!listing || (listing.status !== 'published' && !seller)) throw new SchoodAIError('not_found', 'Listing not found.', 404);
  const [copy, ratings] = await Promise.all([store.copyFor(listing.id, access.workspace.id), store.ratings(listing.id, 20)]);
  return {
    listing: { ...card(listing), preview: preview(listing.material), moderation_note: seller ? listing.moderationNote : null },
    ratings: ratings.map((rating) => ({ stars: rating.stars, comment: rating.comment, mine: rating.userId === ctx.user.id, created_at: rating.createdAt })),
    mine: { seller: !!seller, copy_id: copy?.pageId ?? null, rated: ratings.some((rating) => rating.userId === ctx.user.id) },
    paid_enabled: await paidEnabled(ctx),
  };
}

/** POST teacher/market-acquire: a free listing goes into your library. Paid ones wait for checkout (owner decision). */
export async function acquireListing(ctx: RequestContext) {
  const body = record(await ctx.body());
  const access = await ctx.requireFeature('T6');
  const { store } = await teacherDeps();
  const listing = await store.listing(uuid(body.id, 'id'));
  if (!listing || listing.status !== 'published') throw new SchoodAIError('not_found', 'Listing not found.', 404);
  if (listing.sellerWorkspaceId === access.workspace.id) throw new SchoodAIError('own_listing', 'This is your own listing.', 409);
  const existing = await store.copyFor(listing.id, access.workspace.id);
  if (existing) return { copy: { page_id: existing.pageId, created: false } };
  if (listing.priceUzs > 0) {
    if (!(await paidEnabled(ctx))) throw new SchoodAIError('paid_listings_off', 'Paid materials are not on sale yet.', 409);
    throw new SchoodAIError('checkout_unavailable', 'Buying paid materials opens soon.', 409);
  }
  const material = parseMaterial(listing.material);
  const page = await saveApprovedCopy(ctx, material);
  const copy = await store.addCopy({ listingId: listing.id, workspaceId: access.workspace.id, userId: ctx.user.id, pageId: page.id, priceUzs: 0 });
  if (!copy) {
    // Another tab took the copy first: keep theirs.
    const first = await store.copyFor(listing.id, access.workspace.id);
    return { copy: { page_id: first?.pageId ?? page.id, created: false } };
  }
  await ctx.audit('market.acquired', { price_uzs: 0 }, { type: 'listing', id: listing.id });
  return { copy: { page_id: page.id, created: true } };
}

/** POST teacher/market-rate: one rating per person, only from a workspace that holds a copy. */
export async function rateListing(ctx: RequestContext) {
  const body = record(await ctx.body());
  const access = await ctx.workspace();
  const { store } = await teacherDeps();
  const listing = await store.listing(uuid(body.id, 'id'));
  if (!listing || listing.status !== 'published') throw new SchoodAIError('not_found', 'Listing not found.', 404);
  if (!(await store.copyFor(listing.id, access.workspace.id))) throw new SchoodAIError('copy_required', 'Take a copy before rating it.', 409);
  const rated = await store.rateListing({ listingId: listing.id, userId: ctx.user.id, stars: integer(body.stars, 'stars', 1, 5), comment: optionalText(body.comment, 'comment', { max: 1000 }) });
  return { listing: card(rated ?? listing) };
}

// --- Selling ------------------------------------------------------------------------------

interface ListingPayload { page_id: string; revision: number; title: string; description: string; tags: string[]; price_uzs: number; seller_name: string }
const SUMMARY: Record<Locale, string> = {
  en: 'List “{title}” on the Schood marketplace ({price}) for Schood review',
  uz: '“{title}”ni Schood marketpleysiga ({price}) Schood tekshiruviga yuborish',
  ru: 'Выставить «{title}» на маркетплейс Schood ({price}) на проверку Schood',
};
const priceLabel = (price: number, locale: Locale) => price === 0 ? { en: 'free', uz: 'bepul', ru: 'бесплатно' }[locale] : `${price.toLocaleString('en-US').replace(/,/g, ' ')} UZS`;

export function registerMarketActions(): void {
  registerActionKind<ListingPayload>({
    kind: 'publish_listing', area: 'teacher', approverRoles: ['owner', 'admin'], expiresInHours: 168,
    parse(value) {
      const p = record(value, 'payload');
      const price = Number.isInteger(p.price_uzs) ? Number(p.price_uzs) : -1;
      if (price < 0 || price > 10_000_000) throw new SchoodAIError('invalid_request', 'The price is not valid.', 400, { field: 'price_uzs' });
      return {
        page_id: uuid(p.page_id, 'page_id'), revision: Number.isInteger(p.revision) ? Number(p.revision) : 0, title: text(p.title, 'title', { max: 160 }),
        description: text(p.description ?? '', 'description', { max: 2000, min: 0 }), tags: Array.isArray(p.tags) ? stringList(p.tags, 'tags', { max: 12, pattern: /^[\p{L}\p{N} _-]{1,30}$/u }) : [],
        price_uzs: price, seller_name: text(p.seller_name, 'seller_name', { max: 120 }),
      };
    },
    summary: (p, locale) => SUMMARY[locale].replace('{title}', p.title).replace('{price}', priceLabel(p.price_uzs, locale)),
    display: (p) => ({ title: p.title, seller: p.seller_name, price: p.price_uzs ? `${p.price_uzs} UZS` : 'free', tags: p.tags.join(', ') || '—', description: p.description || '—', next: 'Schood moderation, then published' }),
    async run(ctx, p) {
      const { page, access, material } = await approvedPage(ctx, p.page_id);
      if (page.revision !== p.revision) throw new SchoodAIError('material_changed', 'The material was edited after this was proposed. Propose it again.', 409);
      if (p.price_uzs > 0 && !(await paidEnabled(ctx))) throw new SchoodAIError('paid_listings_off', 'Paid listings are not open yet.', 409);
      const { store } = await teacherDeps();
      if (await store.copyByPage(page.id)) throw new SchoodAIError('not_original', 'Only your own materials can be listed.', 409);
      const listing = await store.createListing({
        sellerWorkspaceId: access.workspace.id, sellerId: ctx.user.id, sellerName: p.seller_name, sourcePageId: page.id, title: p.title, description: p.description,
        kind: material.kind, level: material.level, exam: material.exam?.format ?? null, language: material.instruction_language, tags: p.tags,
        material: material as unknown as Record<string, unknown>, priceUzs: p.price_uzs, status: 'pending',
      });
      return { listing_id: listing.id, status: 'pending' };
    },
  });
}

/** POST teacher/market-list: propose listing an approved material of yours (Approve & run, then moderation). */
export async function proposeListing(ctx: RequestContext) {
  const body = record(await ctx.body());
  await ctx.requireFeature('T12');
  const { page, access, material } = await approvedPage(ctx, body.page_id);
  const { store } = await teacherDeps();
  if (await store.copyByPage(page.id)) throw new SchoodAIError('not_original', 'Only your own materials can be listed.', 409);
  const price = body.price_uzs === undefined ? 0 : integer(body.price_uzs, 'price_uzs', 0, 10_000_000);
  if (price > 0 && !(await paidEnabled(ctx))) throw new SchoodAIError('paid_listings_off', 'Paid listings are not open yet. List it for free, or wait.', 409);
  const checks = checkMaterial(material);
  if (checks.errors) throw new SchoodAIError('fix_before_listing', 'Fix the answer-key problems before listing this material.', 409, { errors: checks.errors });
  const profile = await ctx.repo.profile(ctx.user.id);
  const sellerName = access.workspace.kind === 'centre' ? access.workspace.name : profile?.name || ctx.user.email?.split('@')[0] || 'Teacher';
  const view = await ctx.actions.propose({
    kind: 'publish_listing',
    payload: {
      page_id: page.id, revision: page.revision, title: text(body.title ?? material.title, 'title', { max: 160 }),
      description: optionalText(body.description, 'description', { max: 2000 }) ?? '', tags: Array.isArray(body.tags) ? body.tags.slice(0, 12) : [], price_uzs: price, seller_name: sellerName.slice(0, 120),
    },
  });
  return { action: actionView(view, ctx.user.id) };
}

/** GET teacher/market-mine: your listings, their status and the earnings ledger. */
export async function myListings(ctx: RequestContext) {
  const access = await ctx.workspace();
  const { store } = await teacherDeps();
  const [listings, ledger] = await Promise.all([store.sellerListings(access.workspace.id), store.ledger(access.workspace.id, 100)]);
  const pending = ledger.filter((row) => row.status === 'pending');
  return {
    listings: listings.map((listing) => ({ ...card(listing), moderation_note: listing.moderationNote, source_page_id: listing.sourcePageId })),
    ledger: ledger.map((row) => ({ id: row.id, listing_id: row.listingId, gross_uzs: row.grossUzs, commission_uzs: row.commissionUzs, net_uzs: row.netUzs, status: row.status, created_at: row.createdAt })),
    totals: { gross_pending_uzs: pending.reduce((sum, row) => sum + row.grossUzs, 0), commission_rate: MARKETPLACE_COMMISSION_RATE },
    paid_enabled: await paidEnabled(ctx),
  };
}

/** POST teacher/market-withdraw: the seller takes a listing down. Copies people already took stay theirs. */
export async function withdrawListing(ctx: RequestContext) {
  const body = record(await ctx.body());
  const access = await ctx.workspace({ roles: ['owner', 'admin', 'teacher'] });
  const { store } = await teacherDeps();
  const listing = await store.listing(uuid(body.id, 'id'));
  if (!listing || listing.sellerWorkspaceId !== access.workspace.id) throw new SchoodAIError('not_found', 'Listing not found.', 404);
  if (access.workspace.kind === 'centre' && access.role === 'teacher' && listing.sellerId !== ctx.user.id) throw new SchoodAIError('role_required', 'Ask the centre owner to withdraw this listing.', 403);
  const updated = await store.updateListing(listing.id, { status: 'withdrawn' }, ['pending', 'published', 'rejected']);
  await ctx.audit('market.withdrawn', {}, { type: 'listing', id: listing.id });
  return { listing: card(updated ?? listing) };
}

// --- Schood moderation ----------------------------------------------------------------------

async function requireModerator(ctx: RequestContext) {
  if (!(await ctx.isSchoodAdmin())) throw new SchoodAIError('not_found', 'Not found.', 404);
}
export const moderation = {
  /** The queue, oldest first, with each material's key checks. */
  async GET(ctx: RequestContext) {
    await requireModerator(ctx);
    const { store } = await teacherDeps();
    const queue = await store.moderationQueue(50);
    return {
      queue: queue.map((listing) => {
        let checks = null;
        try { checks = checkMaterial(parseMaterial(listing.material)); } catch { checks = null; }
        return { ...card(listing), material: listing.material, checks, seller_workspace_id: listing.sellerWorkspaceId, submitted_at: listing.updatedAt };
      }),
    };
  },
  async POST(ctx: RequestContext) {
    await requireModerator(ctx);
    const body = record(await ctx.body());
    const decision = oneOf(body.decision, 'decision', ['publish', 'reject'] as const);
    const note = optionalText(body.note, 'note', { max: 1000 });
    if (decision === 'reject' && !note) throw new SchoodAIError('invalid_request', 'Tell the seller what to fix.', 400, { field: 'note' });
    const { store } = await teacherDeps();
    const now = ctx.now().toISOString();
    const updated = await store.updateListing(uuid(body.id, 'id'), {
      status: decision === 'publish' ? 'published' : 'rejected', moderationNote: note, moderatedBy: ctx.user.id, moderatedAt: now, ...(decision === 'publish' ? { publishedAt: now } : {}),
    }, ['pending']);
    if (!updated) throw new SchoodAIError('not_pending', 'This listing is not waiting for review.', 409);
    await ctx.audit(`market.${decision === 'publish' ? 'published' : 'rejected'}`, {}, { type: 'listing', id: updated.id });
    return { listing: card(updated) };
  },
};

/**
 * Records a paid sale in the seller's earnings ledger. Called by checkout once the owner
 * builds it; nothing calls it today. The commission stays empty until its rate is set.
 */
export async function recordSale(input: { listing: Listing; copy: ListingCopy; reference: string }): Promise<SellerLedgerRow | null> {
  const { store } = await teacherDeps();
  const commission = MARKETPLACE_COMMISSION_RATE === null ? null : Math.round(input.copy.priceUzs * MARKETPLACE_COMMISSION_RATE);
  return store.addLedger({
    listingId: input.listing.id, sellerWorkspaceId: input.listing.sellerWorkspaceId, buyerWorkspaceId: input.copy.workspaceId, grossUzs: input.copy.priceUzs,
    commissionUzs: commission, netUzs: commission === null ? null : input.copy.priceUzs - commission, status: 'pending', reference: input.reference,
  });
}

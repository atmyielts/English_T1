import type {
  BrandProfile, Channel, ChannelBatch, ChannelPost, Handout, Listing, ListingCopy, ListingRating, MarkingBatch, QuizAnswer, QuizPlayer, QuizSession,
  Script, SellerLedgerRow, TeacherStore, TutorResult,
} from './store.ts';

// The teacher store in memory, for tests and the local dev stack. It keeps the same
// guarantees as the Postgres functions: one answer per player and question, unique
// open quiz codes and nicknames, one rating per person, one copy per workspace, one
// verified use per workspace and kind, and status-guarded updates.

export function createMemoryTeacherStore(options: { now?: () => Date } = {}) {
  const now = options.now ?? (() => new Date());
  const iso = () => now().toISOString();
  const clone = <T>(value: T): T => structuredClone(value);
  const handouts = new Map<string, Handout>();
  const sessions = new Map<string, QuizSession>(), players = new Map<string, QuizPlayer>(), answers: QuizAnswer[] = [];
  const batches = new Map<string, MarkingBatch>(), scripts = new Map<string, Script>();
  const channels = new Map<string, Channel>(), channelBatches = new Map<string, ChannelBatch>(), posts = new Map<string, ChannelPost>();
  const listings = new Map<string, Listing>(), ratings: ListingRating[] = [], copies = new Map<string, ListingCopy>();
  const uses = new Set<string>(), ledgerRows: SellerLedgerRow[] = [];
  const profiles = new Map<string, BrandProfile>(), results = new Map<string, TutorResult>();
  let ledgerId = 0;

  const store: TeacherStore = {
    createHandout(input) {
      const row: Handout = { ...input, id: crypto.randomUUID(), createdAt: iso(), revokedAt: null };
      handouts.set(row.id, row);
      return Promise.resolve(clone(row));
    },
    handoutByHash: (hash) => Promise.resolve(clone([...handouts.values()].find((row) => row.tokenHash === hash) ?? null)),
    revokeHandout(id, at) { const row = handouts.get(id); if (row && !row.revokedAt) row.revokedAt = at; return Promise.resolve(); },

    createQuizSession(input) {
      if ([...sessions.values()].some((row) => row.code === input.code && row.status !== 'finished')) return Promise.resolve(null);
      const row: QuizSession = { ...clone(input), id: crypto.randomUUID(), status: 'lobby', currentIndex: -1, questionStartedAt: null, createdAt: iso(), updatedAt: iso(), finishedAt: null };
      sessions.set(row.id, row);
      return Promise.resolve(clone(row));
    },
    quizSession: (id) => Promise.resolve(clone(sessions.get(id) ?? null)),
    quizSessionByCode: (code) => Promise.resolve(clone([...sessions.values()].find((row) => row.code === code && row.status !== 'finished') ?? null)),
    quizSessions: (workspaceId, hostId, limit) => Promise.resolve([...sessions.values()].filter((row) => row.workspaceId === workspaceId && row.hostId === hostId).reverse().slice(0, limit).map(clone)),
    updateQuizSession(id, patch, from) {
      const row = sessions.get(id);
      if (!row || !from.includes(row.status)) return Promise.resolve(null);
      Object.assign(row, clone(patch), { updatedAt: iso() });
      return Promise.resolve(clone(row));
    },
    addQuizPlayer(input) {
      const taken = [...players.values()].some((row) => row.sessionId === input.sessionId && !row.removed && row.nickname.toLowerCase() === input.nickname.toLowerCase());
      if (taken) return Promise.resolve(null);
      const row: QuizPlayer = { ...input, id: crypto.randomUUID(), score: 0, correct: 0, answered: 0, joinedAt: iso(), removed: false };
      players.set(row.id, row);
      return Promise.resolve(clone(row));
    },
    quizPlayer: (sessionId, hash) => Promise.resolve(clone([...players.values()].find((row) => row.sessionId === sessionId && row.tokenHash === hash && !row.removed) ?? null)),
    quizPlayerByUser: (sessionId, userId) => Promise.resolve(clone([...players.values()].find((row) => row.sessionId === sessionId && row.userId === userId && !row.removed) ?? null)),
    quizPlayers: (sessionId) => Promise.resolve([...players.values()].filter((row) => row.sessionId === sessionId && !row.removed).sort((a, b) => b.score - a.score || a.joinedAt.localeCompare(b.joinedAt)).map(clone)),
    removeQuizPlayer(sessionId, playerId) {
      const row = players.get(playerId);
      if (!row || row.sessionId !== sessionId || row.removed) return Promise.resolve(false);
      row.removed = true;
      return Promise.resolve(true);
    },
    answerQuiz(input) {
      if (answers.some((row) => row.playerId === input.playerId && row.index === input.index)) return Promise.resolve(false);
      const player = players.get(input.playerId);
      if (!player || player.sessionId !== input.sessionId || player.removed) return Promise.resolve(false);
      answers.push({ ...input, answeredAt: iso() });
      player.score += input.points;
      player.answered += 1;
      if (input.correct) player.correct += 1;
      return Promise.resolve(true);
    },
    quizAnswers: (sessionId, index) => Promise.resolve(answers.filter((row) => row.sessionId === sessionId && (index === undefined || row.index === index)).map(clone)),

    createBatch(input) {
      const row: MarkingBatch = { ...input, id: crypto.randomUUID(), status: 'open', createdAt: iso(), updatedAt: iso() };
      batches.set(row.id, row);
      return Promise.resolve(clone(row));
    },
    batch: (id) => Promise.resolve(clone(batches.get(id) ?? null)),
    batches(workspaceId, ownerId, limit) {
      const rows = [...batches.values()].filter((row) => row.workspaceId === workspaceId && (!ownerId || row.ownerId === ownerId)).reverse().slice(0, limit);
      return Promise.resolve(rows.map((row) => {
        const own = [...scripts.values()].filter((script) => script.batchId === row.id);
        return { ...clone(row), scripts: own.length, confirmed: own.filter((script) => script.status === 'confirmed').length };
      }));
    },
    updateBatch(id, patch) {
      const row = batches.get(id);
      if (!row) return Promise.resolve(null);
      Object.assign(row, clone(patch), { updatedAt: iso() });
      return Promise.resolve(clone(row));
    },
    addScript(input) {
      const row: Script = { ...clone(input), id: crypto.randomUUID(), draft: null, final: null, signals: null, status: 'new', errorCode: null, confirmedBy: null, confirmedAt: null, createdAt: iso(), updatedAt: iso() };
      scripts.set(row.id, row);
      return Promise.resolve(clone(row));
    },
    script: (id) => Promise.resolve(clone(scripts.get(id) ?? null)),
    scripts: (batchId) => Promise.resolve([...scripts.values()].filter((row) => row.batchId === batchId).map(clone)),
    updateScript(id, patch, from) {
      const row = scripts.get(id);
      if (!row || (from && !from.includes(row.status))) return Promise.resolve(null);
      Object.assign(row, clone(patch), { updatedAt: iso() });
      return Promise.resolve(clone(row));
    },
    deleteScript(id) { scripts.delete(id); return Promise.resolve(); },

    createChannel(input) {
      if ([...channels.values()].some((row) => row.workspaceId === input.workspaceId && row.chatId === input.chatId)) return Promise.resolve(null);
      const row: Channel = { ...clone(input), id: crypto.randomUUID(), status: 'pending', verifiedAt: null, lastError: null, createdAt: iso(), updatedAt: iso() };
      channels.set(row.id, row);
      return Promise.resolve(clone(row));
    },
    channel: (id) => Promise.resolve(clone(channels.get(id) ?? null)),
    channels: (workspaceId) => Promise.resolve([...channels.values()].filter((row) => row.workspaceId === workspaceId).map(clone)),
    updateChannel(id, patch) {
      const row = channels.get(id);
      if (!row) return Promise.resolve(null);
      Object.assign(row, clone(patch), { updatedAt: iso() });
      return Promise.resolve(clone(row));
    },
    deleteChannel(id) {
      channels.delete(id);
      for (const [key, batch] of channelBatches) if (batch.channelId === id) channelBatches.delete(key);
      for (const [key, post] of posts) if (post.channelId === id) posts.delete(key);
      return Promise.resolve();
    },
    createChannelBatch(input) {
      const row: ChannelBatch = { ...input, id: crypto.randomUUID(), status: 'generating', actionId: null, credits: 0, createdAt: iso(), updatedAt: iso() };
      channelBatches.set(row.id, row);
      return Promise.resolve(clone(row));
    },
    channelBatch: (id) => Promise.resolve(clone(channelBatches.get(id) ?? null)),
    channelBatches: (channelId, limit) => Promise.resolve([...channelBatches.values()].filter((row) => row.channelId === channelId).reverse().slice(0, limit).map(clone)),
    updateChannelBatch(id, patch, from) {
      const row = channelBatches.get(id);
      if (!row || (from && !from.includes(row.status))) return Promise.resolve(null);
      Object.assign(row, clone(patch), { updatedAt: iso() });
      return Promise.resolve(clone(row));
    },
    addChannelPosts(input) {
      const rows = input.map((post) => ({ ...clone(post), id: crypto.randomUUID(), status: 'draft' as const, messageId: null, attempts: 0, lastError: null, sentAt: null, createdAt: iso() }));
      for (const row of rows) posts.set(row.id, row);
      return Promise.resolve(rows.map(clone));
    },
    channelPosts: (batchId) => Promise.resolve([...posts.values()].filter((row) => row.batchId === batchId).sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)).map(clone)),
    channelPost: (id) => Promise.resolve(clone(posts.get(id) ?? null)),
    updateChannelPost(id, patch, from) {
      const row = posts.get(id);
      if (!row || (from && !from.includes(row.status))) return Promise.resolve(null);
      Object.assign(row, clone(patch));
      return Promise.resolve(clone(row));
    },
    duePosts: (at, limit, workspaceIds) => Promise.resolve([...posts.values()]
      .filter((row) => row.status === 'scheduled' && row.scheduledFor <= at && (!workspaceIds || workspaceIds.includes(row.workspaceId)))
      .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor)).slice(0, limit).map(clone)),
    sentSince: (channelId, since) => Promise.resolve([...posts.values()].filter((row) => row.channelId === channelId && row.status === 'sent' && !!row.sentAt && row.sentAt >= since).length),

    createListing(input) {
      const row: Listing = { ...clone(input), id: crypto.randomUUID(), ratingSum: 0, ratingCount: 0, usageCount: 0, copies: 0, moderationNote: null, moderatedBy: null, moderatedAt: null, createdAt: iso(), updatedAt: iso(), publishedAt: null };
      listings.set(row.id, row);
      return Promise.resolve(clone(row));
    },
    listing: (id) => Promise.resolve(clone(listings.get(id) ?? null)),
    updateListing(id, patch, from) {
      const row = listings.get(id);
      if (!row || (from && !from.includes(row.status))) return Promise.resolve(null);
      Object.assign(row, clone(patch), { updatedAt: iso() });
      return Promise.resolve(clone(row));
    },
    searchListings(query) {
      const words = (query.text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
      const rows = [...listings.values()].filter((row) => row.status === 'published'
        && (!query.kind || row.kind === query.kind) && (!query.level || row.level === query.level) && (!query.exam || row.exam === query.exam)
        && (!query.language || row.language === query.language)
        && (query.price === 'free' ? row.priceUzs === 0 : query.price === 'paid' ? row.priceUzs > 0 : true)
        && words.every((word) => `${row.title} ${row.description} ${row.tags.join(' ')}`.toLowerCase().includes(word)));
      const score = (row: Listing) => (row.ratingCount ? row.ratingSum / row.ratingCount : 0);
      rows.sort((a, b) => query.sort === 'usage' ? b.usageCount - a.usageCount : query.sort === 'new' ? (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') : score(b) - score(a) || b.ratingCount - a.ratingCount);
      return Promise.resolve({ rows: rows.slice(query.offset, query.offset + query.limit).map(clone), total: rows.length });
    },
    sellerListings: (workspaceId) => Promise.resolve([...listings.values()].filter((row) => row.sellerWorkspaceId === workspaceId).reverse().map(clone)),
    moderationQueue: (limit) => Promise.resolve([...listings.values()].filter((row) => row.status === 'pending').sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).slice(0, limit).map(clone)),
    rateListing(input) {
      const listing = listings.get(input.listingId);
      if (!listing) return Promise.resolve(null);
      const existing = ratings.findIndex((row) => row.listingId === input.listingId && row.userId === input.userId);
      if (existing >= 0) { listing.ratingSum -= ratings[existing].stars; listing.ratingCount -= 1; ratings.splice(existing, 1); }
      ratings.push({ ...input, createdAt: iso() });
      listing.ratingSum += input.stars;
      listing.ratingCount += 1;
      return Promise.resolve(clone(listing));
    },
    ratings: (listingId, limit) => Promise.resolve(ratings.filter((row) => row.listingId === listingId).reverse().slice(0, limit).map(clone)),
    addCopy(input) {
      if ([...copies.values()].some((row) => row.listingId === input.listingId && row.workspaceId === input.workspaceId)) return Promise.resolve(null);
      const row: ListingCopy = { ...input, id: crypto.randomUUID(), createdAt: iso() };
      copies.set(row.id, row);
      const listing = listings.get(input.listingId);
      if (listing) listing.copies += 1;
      return Promise.resolve(clone(row));
    },
    copyFor: (listingId, workspaceId) => Promise.resolve(clone([...copies.values()].find((row) => row.listingId === listingId && row.workspaceId === workspaceId) ?? null)),
    copyByGeneration: (generationId) => Promise.resolve(clone([...copies.values()].find((row) => row.generationId === generationId) ?? null)),
    recordUse(listingId, workspaceId, kind) {
      const holds = [...copies.values()].some((row) => row.listingId === listingId && row.workspaceId === workspaceId);
      const listing = listings.get(listingId);
      if (!holds || !listing) return Promise.resolve(false);
      const firstForWorkspace = ![...uses].some((key) => key.startsWith(`${listingId}:${workspaceId}:`));
      const key = `${listingId}:${workspaceId}:${kind}`;
      if (uses.has(key)) return Promise.resolve(false);
      uses.add(key);
      if (firstForWorkspace) listing.usageCount += 1;
      return Promise.resolve(true);
    },
    addLedger(row) {
      if (ledgerRows.some((entry) => entry.reference === row.reference)) return Promise.resolve(null);
      const entry: SellerLedgerRow = { ...row, id: ++ledgerId, createdAt: iso() };
      ledgerRows.push(entry);
      return Promise.resolve(clone(entry));
    },
    ledger: (workspaceId, limit) => Promise.resolve(ledgerRows.filter((row) => row.sellerWorkspaceId === workspaceId).reverse().slice(0, limit).map(clone)),

    brandProfile: (workspaceId) => Promise.resolve(clone(profiles.get(workspaceId) ?? null)),
    saveBrandProfile(profile) {
      const row: BrandProfile = { ...clone(profile), updatedAt: iso() };
      profiles.set(profile.workspaceId, row);
      return Promise.resolve(clone(row));
    },
    results: (workspaceId) => Promise.resolve([...results.values()].filter((row) => row.workspaceId === workspaceId).sort((a, b) => b.achievedOn.localeCompare(a.achievedOn)).map(clone)),
    addResult(input) {
      const row: TutorResult = { ...clone(input), id: crypto.randomUUID(), createdAt: iso() };
      results.set(row.id, row);
      return Promise.resolve(clone(row));
    },
    deleteResult(workspaceId, id) {
      const row = results.get(id);
      if (!row || row.workspaceId !== workspaceId) return Promise.resolve(false);
      results.delete(id);
      return Promise.resolve(true);
    },
  };
  return { store, sessions, players, answers, scripts, channels, posts, listings, copies, ledger: ledgerRows, handouts };
}

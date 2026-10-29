import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import { normalizeWord } from '../../_shared/english-word-store.ts';
import type {
  ActivityRow, BriefSchedule, ConsentRow, DuelRow, EnglishDuelState, ExamOutcome, FamilyLink, LearnerStore, RecordRow, Snapshot,
} from './store.ts';

// The learner store on Postgres through the service role (see store.ts). Family
// invites and accepts go through the race-safe SQL functions of the learner
// migration; existing tables are used the way their own services use them:
// the vocabulary notebook upsert keeps words a learner already has (like
// english-word-store.ts addDrillWords), duels are created by english-duel-service.

type Row = Record<string, unknown>;
// deno-lint-ignore no-explicit-any
type Db = any;
const str = (value: unknown) => (value === null || value === undefined ? null : String(value));
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {});
function check<T>(result: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (result.error) throw new Error(`${result.error.code ?? 'db'}: ${result.error.message}`);
  return result.data as T;
}

const consent = (row: Row): ConsentRow => ({
  userId: String(row.user_id), ageBand: row.age_band as ConsentRow['ageBand'], guardianConfirmed: row.guardian_confirmed === true,
  guardianUserId: str(row.guardian_user_id), textVersion: String(row.text_version), acceptedAt: String(row.accepted_at), withdrawnAt: str(row.withdrawn_at),
});
const link = (row: Row): FamilyLink => ({
  id: String(row.id), workspaceId: String(row.workspace_id), parentId: String(row.parent_id), childId: str(row.child_id), childLabel: String(row.child_label),
  status: row.status as FamilyLink['status'], inviteHint: str(row.invite_hint), inviteExpiresAt: str(row.invite_expires_at), createdAt: String(row.created_at),
  acceptedAt: str(row.accepted_at), endedAt: str(row.ended_at),
});
const activity = (row: Row): ActivityRow => ({
  id: Number(row.id), userId: String(row.user_id), workspaceId: str(row.workspace_id), feature: String(row.feature), kind: String(row.kind),
  score: row.score === null || row.score === undefined ? null : Number(row.score), minutes: Number(row.minutes ?? 0), summary: obj(row.summary), createdAt: String(row.created_at),
});
const record = (row: Row): RecordRow => ({
  id: String(row.id), userId: String(row.user_id), workspaceId: String(row.workspace_id), kind: row.kind as RecordRow['kind'], day: str(row.day),
  status: row.status as RecordRow['status'], input: obj(row.input), output: obj(row.output), secret: obj(row.secret), state: obj(row.state),
  version: Number(row.version ?? 1), credits: Number(row.credits ?? 0), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
});
const schedule = (row: Row): BriefSchedule => ({
  userId: String(row.user_id), kind: row.kind as BriefSchedule['kind'], enabled: row.enabled !== false, sendTime: String(row.send_time ?? '08:30').slice(0, 5),
  weekday: row.weekday === null || row.weekday === undefined ? null : Number(row.weekday), timeZone: String(row.time_zone ?? 'Asia/Tashkent'),
  locale: (['en', 'uz', 'ru'].includes(String(row.locale)) ? row.locale : 'en') as BriefSchedule['locale'], nextDueAt: str(row.next_due_at), lastSentAt: str(row.last_sent_at),
});
const duel = (row: Row): DuelRow => ({
  duelId: String(row.duel_id), code: String(row.code), creatorId: String(row.creator_id), workspaceId: String(row.workspace_id), topic: String(row.topic),
  level: str(row.level), referralCode: str(row.referral_code), scoredAt: str(row.scored_at), createdAt: String(row.created_at),
});
const RECORD_COLUMNS = 'id, user_id, workspace_id, kind, day, status, input, output, secret, state, version, credits, created_at, updated_at';
const LINK_COLUMNS = 'id, workspace_id, parent_id, child_id, child_label, status, invite_hint, invite_expires_at, created_at, accepted_at, ended_at';

export function createPostgresLearnerStore(url: string, serviceKey: string): LearnerStore {
  const db: Db = createClient(url, serviceKey, { auth: { persistSession: false } });
  let englishId: Promise<string> | null = null;
  const english = () => (englishId ??= (async () => {
    const row = check<Row | null>(await db.from('languages').select('id').eq('code', 'en').maybeSingle());
    if (!row?.id) throw new Error('English language row is missing');
    return String(row.id);
  })().catch((cause) => { englishId = null; throw cause; }));
  const appEnv = (name: string, fallback: string) => { try { return Deno.env.get(name) ?? fallback; } catch { return fallback; } };

  return {
    async consent(userId) {
      const row = check<Row | null>(await db.from('ai_learner_consents').select('*').eq('user_id', userId).maybeSingle());
      return row ? consent(row) : null;
    },
    async saveConsent(row) {
      const saved = check<Row>(await db.from('ai_learner_consents').upsert({
        user_id: row.userId, age_band: row.ageBand, guardian_confirmed: row.guardianConfirmed, guardian_user_id: row.guardianUserId,
        text_version: row.textVersion, accepted_at: row.acceptedAt, withdrawn_at: row.withdrawnAt, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' }).select('*').single());
      return consent(saved);
    },

    async familyInvite(input) {
      const out = obj(check(await db.rpc('ai_learner_family_invite', {
        p_workspace: input.workspaceId, p_parent: input.parentId, p_label: input.label, p_hash: input.hash, p_hint: input.hint,
        p_expires: input.expiresAt, p_consent: input.consentVersion, p_now: input.now, p_limit: input.limit,
      })));
      return out.ok === true ? { ok: true, id: String(out.id) } : { ok: false, code: 'limit' };
    },
    async familyAccept(hash, childId, now, limit) {
      const out = obj(check(await db.rpc('ai_learner_family_accept', { p_hash: hash, p_child: childId, p_now: now, p_limit: limit })));
      if (out.ok === true) return { ok: true, id: String(out.id), workspaceId: String(out.workspace_id), parentId: String(out.parent_id) };
      const code = String(out.code);
      return { ok: false, code: (['expired', 'own_invite', 'already_linked', 'limit'].includes(code) ? code : 'not_found') as 'not_found' };
    },
    async familyLinks(filter) {
      let query = db.from('ai_learner_family_links').select(LINK_COLUMNS).order('created_at', { ascending: true }).limit(50);
      if (filter.workspaceId) query = query.eq('workspace_id', filter.workspaceId);
      if (filter.parentId) query = query.eq('parent_id', filter.parentId);
      if (filter.childId) query = query.eq('child_id', filter.childId);
      if (filter.statuses) query = query.in('status', filter.statuses);
      return (check<Row[]>(await query) ?? []).map(link);
    },
    async familyLink(id) {
      const row = check<Row | null>(await db.from('ai_learner_family_links').select(LINK_COLUMNS).eq('id', id).maybeSingle());
      return row ? link(row) : null;
    },
    async endFamilyLink(id, status, actorId, now) {
      const row = check<Row | null>(await db.from('ai_learner_family_links').update({ status, ended_at: now, ended_by: actorId, invite_hash: null })
        .eq('id', id).in('status', ['invited', 'active']).select(LINK_COLUMNS).maybeSingle());
      return row ? link(row) : null;
    },

    async addActivity(rows) {
      if (!rows.length) return;
      check(await db.from('ai_learner_activity').insert(rows.map((row) => ({
        user_id: row.userId, workspace_id: row.workspaceId, feature: row.feature, kind: row.kind, score: row.score ?? null, minutes: row.minutes ?? 0, summary: row.summary ?? {},
      }))));
    },
    async activity(userId, options) {
      let query = db.from('ai_learner_activity').select('*').eq('user_id', userId).order('id', { ascending: false }).limit(options.limit);
      if (options.since) query = query.gte('created_at', options.since);
      if (options.kinds) query = query.in('kind', options.kinds);
      return (check<Row[]>(await query) ?? []).map(activity);
    },

    async createRecord(input) {
      const row = check<Row>(await db.from('ai_learner_records').insert({
        user_id: input.userId, workspace_id: input.workspaceId, kind: input.kind, day: input.day ?? null, status: input.status ?? 'ready',
        input: input.input ?? {}, output: input.output ?? {}, secret: input.secret ?? {}, state: input.state ?? {}, credits: input.credits ?? 0,
      }).select(RECORD_COLUMNS).single());
      return record(row);
    },
    async record(id) {
      const row = check<Row | null>(await db.from('ai_learner_records').select(RECORD_COLUMNS).eq('id', id).maybeSingle());
      return row ? record(row) : null;
    },
    async records(userId, options) {
      let query = db.from('ai_learner_records').select(RECORD_COLUMNS).eq('user_id', userId).eq('kind', options.kind).order('created_at', { ascending: false }).limit(options.limit);
      if (options.workspaceId) query = query.eq('workspace_id', options.workspaceId);
      if (options.status) query = query.in('status', options.status);
      return (check<Row[]>(await query) ?? []).map(record);
    },
    async recordOfDay(userId, kind, day) {
      const row = check<Row | null>(await db.from('ai_learner_records').select(RECORD_COLUMNS).eq('user_id', userId).eq('kind', kind).eq('day', day).maybeSingle());
      return row ? record(row) : null;
    },
    async updateRecord(id, version, patch) {
      const row = check<Row | null>(await db.from('ai_learner_records').update({ ...patch, version: version + 1, updated_at: new Date().toISOString() })
        .eq('id', id).eq('version', version).select(RECORD_COLUMNS).maybeSingle());
      return row ? record(row) : null;
    },
    async deleteRecords(userId, workspaceId) {
      let records = db.from('ai_learner_records').delete().eq('user_id', userId);
      let rows = db.from('ai_learner_activity').delete().eq('user_id', userId);
      if (workspaceId) { records = records.eq('workspace_id', workspaceId); rows = rows.eq('workspace_id', workspaceId); }
      const deleted = check<Row[]>(await records.select('id')) ?? [];
      check(await rows);
      return deleted.length;
    },

    async schedule(userId, kind) {
      const row = check<Row | null>(await db.from('ai_learner_briefs').select('*').eq('user_id', userId).eq('kind', kind).maybeSingle());
      return row ? schedule(row) : null;
    },
    async saveSchedule(row) {
      const saved = check<Row>(await db.from('ai_learner_briefs').upsert({
        user_id: row.userId, kind: row.kind, enabled: row.enabled, send_time: row.sendTime, weekday: row.weekday, time_zone: row.timeZone, locale: row.locale,
        next_due_at: row.nextDueAt, last_sent_at: row.lastSentAt, updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,kind' }).select('*').single());
      return schedule(saved);
    },
    async dueSchedules(now, limit) {
      return (check<Row[]>(await db.from('ai_learner_briefs').select('*').eq('enabled', true).lte('next_due_at', now).order('next_due_at').limit(limit)) ?? []).map(schedule);
    },

    async snapshot(userId) {
      const row = check<Row | null>(await db.from('ai_learner_snapshots').select('*').eq('user_id', userId).maybeSingle());
      return row ? { userId, profile: row.profile ? obj(row.profile) : null, prediction: row.prediction ? obj(row.prediction) : null, refreshedAt: String(row.refreshed_at) } satisfies Snapshot : null;
    },
    async saveSnapshot(userId, patch, now) {
      check(await db.from('ai_learner_snapshots').upsert({ user_id: userId, ...patch, refreshed_at: now }, { onConflict: 'user_id' }));
    },

    async telegramThread(userId) {
      const row = check<Row | null>(await db.from('ai_learner_telegram').select('workspace_id, thread_id').eq('user_id', userId).maybeSingle());
      return row ? { workspaceId: str(row.workspace_id), threadId: str(row.thread_id) } : null;
    },
    async setTelegramThread(userId, workspaceId, threadId) {
      check(await db.from('ai_learner_telegram').upsert({ user_id: userId, workspace_id: workspaceId, thread_id: threadId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }));
    },

    async saveDuel(row) {
      const saved = check<Row>(await db.from('ai_learner_duels').insert({
        duel_id: row.duelId, code: row.code, creator_id: row.creatorId, workspace_id: row.workspaceId, topic: row.topic, level: row.level, referral_code: row.referralCode,
      }).select('*').single());
      return duel(saved);
    },
    async duels(creatorId, limit) {
      return (check<Row[]>(await db.from('ai_learner_duels').select('*').eq('creator_id', creatorId).order('created_at', { ascending: false }).limit(limit)) ?? []).map(duel);
    },
    async duelByCode(code) {
      const row = check<Row | null>(await db.from('ai_learner_duels').select('*').eq('code', code).maybeSingle());
      return row ? duel(row) : null;
    },
    async markDuelScored(duelId, now) {
      const row = check<Row | null>(await db.from('ai_learner_duels').update({ scored_at: now }).eq('duel_id', duelId).is('scored_at', null).select('duel_id').maybeSingle());
      return !!row;
    },

    async saveNotebookWords(userId, words, source, now) {
      const languageId = await english();
      const seen = new Set<string>();
      const rows = words.slice(0, 50).flatMap((entry) => {
        const word = entry.word.trim().slice(0, 200), normalized = normalizeWord(word);
        if (!normalized || !entry.definition.trim() || seen.has(normalized)) return [];
        seen.add(normalized);
        return [{
          user_id: userId, language_id: languageId, word, normalized_word: normalized, source_type: 'schood-ai', source_label: source.label.slice(0, 120), source_ref: source.ref.slice(0, 120),
          context_text: entry.example?.slice(0, 600) ?? null, next_review_at: now,
          metadata: { definition: entry.definition.slice(0, 600), example: entry.example?.slice(0, 600) ?? null, translations: { uz: entry.meaningUz, ru: entry.meaningRu }, level: entry.level, captured_at: now },
        }];
      });
      if (!rows.length) return 0;
      // ignoreDuplicates: a word the learner already has keeps its review schedule.
      const data = check<Row[]>(await db.from('user_vocabulary_notebook_entries').upsert(rows, { onConflict: 'user_id,language_id,normalized_word', ignoreDuplicates: true }).select('id'));
      return (data ?? []).length;
    },
    async examOutcomes(userId, limit) {
      const rows = check<Row[]>(await db.from('exam_outcomes').select('overall_band, overall_score, computed_at, products(name)').eq('user_id', userId).eq('status', 'completed').order('computed_at', { ascending: false }).limit(limit)) ?? [];
      return rows.map((row): ExamOutcome => ({
        name: str(obj(row.products).name), band: str(row.overall_band), score: row.overall_score === null || row.overall_score === undefined ? null : Number(row.overall_score), date: str(row.computed_at)?.slice(0, 10) ?? null,
      }));
    },
    async referralCode(userId) {
      const row = check<Row | null>(await db.from('referral_accounts').select('referral_code, status').eq('user_id', userId).maybeSingle());
      return row && row.status === 'active' && /^[A-Z0-9]{4,16}$/.test(String(row.referral_code)) ? String(row.referral_code) : null;
    },
    async displayName(userId) {
      const row = check<Row | null>(await db.from('users').select('full_name').eq('id', userId).maybeSingle());
      const name = String(row?.full_name ?? '').trim();
      return name ? name.split(/\s+/)[0].slice(0, 40) : null;
    },
    async createEnglishDuel(userId, input) {
      const service = await import('../../_shared/english-duel-service.ts');
      const ctx = { sb: db, languageId: await english(), appUrl: appEnv('ENGLISH_APP_URL', 'https://english.schood.online'), botName: appEnv('TELEGRAM_STUDENT_BOT_NAME', 'schoodstudentbot') };
      const created = await service.createDuel(ctx, userId, { channel: input.channel, locale: input.locale, questions: input.questions });
      const row = check<Row>(await db.from('english_duels').select('id').eq('code', created.code).single());
      return { duelId: String(row.id), code: created.code, webUrl: created.links.webUrl, botUrl: created.links.botInviteUrl };
    },
    async englishDuel(code) {
      const row = check<Row | null>(await db.from('english_duels').select('id, code, status, creator_id, opponent_id, winner_id, invite_expires_at').eq('code', code).maybeSingle());
      if (!row) return null;
      const players = check<Row[]>(await db.from('english_duel_players').select('user_id, role, correct_count, answered_count, finished_at, outcome').eq('duel_id', row.id)) ?? [];
      return {
        code: String(row.code), status: row.status as EnglishDuelState['status'], creatorId: String(row.creator_id), opponentId: str(row.opponent_id), winnerId: str(row.winner_id),
        inviteExpiresAt: String(row.invite_expires_at),
        players: players.map((player) => ({
          userId: String(player.user_id), role: player.role === 'opponent' ? 'opponent' as const : 'creator' as const, correct: Number(player.correct_count ?? 0),
          answered: Number(player.answered_count ?? 0), finished: !!player.finished_at, outcome: str(player.outcome),
        })),
      };
    },
  };
}

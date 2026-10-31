import { s } from '../../../../packages/ai-core/src/mod.ts';
import { registerActionKind } from '../actions.ts';
import { integer, oneOf, optionalText, record, stringList, text, uuid } from '../input.ts';
import { SchoodAIError, type Locale, type RequestContext } from '../types.ts';
import { asList, asRecord, centrePrompt, formatWhen, LANGUAGE_NAMES, num, pick, requireCentre } from './shared.ts';
import { academyClient, centreAcademy, guardiansOf, personName, studentRecord } from './academy.ts';
import { centreDeps } from './binding.ts';
import { botToken, sendText } from './bot.ts';
import { draftChecked } from './draft.ts';
import type { CampaignRow } from './store.ts';

// Outbound messages, always drafted by AI and sent only after Approve & run:
//   T8  parent messages from a student's Academy record (uz/ru/en);
//   C3  lead follow-ups and trial-lesson bookings (Academy leads and trials);
//   C11 win-back and renewal campaigns from Academy risk and renewal signals.
// Every send runs as the approving person with their own Academy token.

const LANGS = ['uz', 'ru', 'en'] as const;
const PURPOSES = ['progress', 'attendance', 'homework', 'praise', 'payment', 'meeting', 'other'] as const;
const messageSchema = s.object({ message: s.string({ min: 20, max: 1500 }) });

// --- Action kinds --------------------------------------------------------------------------

export interface FamilyMessage {
  academy_id: string; contact_id: string; student_name: string; to: 'guardian' | 'student'; relationship_id: string | null; recipient: string | null;
  channel: 'telegram' | 'inapp'; language: 'uz' | 'ru' | 'en'; message: string; purpose: string; campaign_id: string | null;
}
function parseFamily(value: unknown): FamilyMessage {
  const p = record(value, 'payload');
  return {
    academy_id: uuid(p.academy_id, 'academy_id'), contact_id: text(p.contact_id, 'contact_id', { max: 64 }), student_name: text(p.student_name, 'student_name', { max: 120 }),
    to: oneOf(p.to ?? 'guardian', 'to', ['guardian', 'student'] as const), relationship_id: p.relationship_id ? text(p.relationship_id, 'relationship_id', { max: 64 }) : null,
    recipient: optionalText(p.recipient, 'recipient', { max: 120 }), channel: oneOf(p.channel ?? 'telegram', 'channel', ['telegram', 'inapp'] as const),
    language: oneOf(p.language, 'language', LANGS), message: text(p.message, 'message', { min: 10, max: 1500 }), purpose: oneOf(p.purpose ?? 'other', 'purpose', [...PURPOSES, 'winback', 'renewal'] as const),
    campaign_id: p.campaign_id ? uuid(p.campaign_id, 'campaign_id') : null,
  };
}

export interface LeadMessage { academy_id: string; lead_id: string; lead_name: string; channel: 'centre_bot' | 'manual'; thread_id: string | null; language: 'uz' | 'ru' | 'en'; message: string; next_follow_up_at: string | null }
function parseLead(value: unknown): LeadMessage {
  const p = record(value, 'payload');
  const next = p.next_follow_up_at ? text(p.next_follow_up_at, 'next_follow_up_at', { max: 40 }) : null;
  if (next && !Number.isFinite(Date.parse(next))) throw new SchoodAIError('invalid_request', 'next_follow_up_at must be a date.', 400);
  return {
    academy_id: uuid(p.academy_id, 'academy_id'), lead_id: text(p.lead_id, 'lead_id', { max: 64 }), lead_name: text(p.lead_name, 'lead_name', { max: 180 }),
    channel: oneOf(p.channel, 'channel', ['centre_bot', 'manual'] as const), thread_id: p.thread_id ? uuid(p.thread_id, 'thread_id') : null,
    language: oneOf(p.language, 'language', LANGS), message: text(p.message, 'message', { min: 10, max: 1500 }), next_follow_up_at: next,
  };
}

export interface TrialBooking {
  booking_id: string; academy_id: string | null; lead_id: string | null; name: string; phone: string | null; telegram: string | null; age: number | null; interest: string | null;
  starts_at: string; ends_at: string; classroom_id: string | null; teacher_user_id: string | null; language: 'uz' | 'ru' | 'en'; confirm_message: string | null; source: 'telegram' | 'website' | 'manual';
}
function parseTrial(value: unknown): TrialBooking {
  const p = record(value, 'payload');
  const starts = text(p.starts_at, 'starts_at', { max: 40 }), ends = text(p.ends_at, 'ends_at', { max: 40 });
  if (!Number.isFinite(Date.parse(starts)) || !(Date.parse(ends) > Date.parse(starts))) throw new SchoodAIError('invalid_request', 'The trial needs a start and a later end.', 400);
  const phone = optionalText(p.phone, 'phone', { max: 20 });
  if (phone && !/^\+?[0-9 ()-]{7,20}$/.test(phone)) throw new SchoodAIError('invalid_request', 'phone is not a phone number.', 400, { field: 'phone' });
  return {
    booking_id: uuid(p.booking_id, 'booking_id'), academy_id: p.academy_id ? uuid(p.academy_id, 'academy_id') : null, lead_id: p.lead_id ? text(p.lead_id, 'lead_id', { max: 64 }) : null,
    name: text(p.name, 'name', { max: 180 }), phone, telegram: optionalText(p.telegram, 'telegram', { max: 40 }), age: p.age === undefined || p.age === null ? null : integer(p.age, 'age', 3, 99),
    interest: optionalText(p.interest, 'interest', { max: 120 }), starts_at: new Date(starts).toISOString(), ends_at: new Date(ends).toISOString(),
    classroom_id: p.classroom_id ? text(p.classroom_id, 'classroom_id', { max: 64 }) : null, teacher_user_id: p.teacher_user_id ? uuid(p.teacher_user_id, 'teacher_user_id') : null,
    language: oneOf(p.language ?? 'uz', 'language', LANGS), confirm_message: optionalText(p.confirm_message, 'confirm_message', { max: 1500 }),
    source: oneOf(p.source ?? 'manual', 'source', ['telegram', 'website', 'manual'] as const),
  };
}

const when = formatWhen;
const trialSummary = (p: TrialBooking, locale: Locale) => pick(locale, { en: `Trial lesson for ${p.name}, ${when(p.starts_at, 'en')}`, uz: `${p.name} uchun sinov darsi, ${when(p.starts_at, 'uz')}`, ru: `Пробный урок: ${p.name}, ${when(p.starts_at, 'ru')}` });
/** A trial booking the admissions agent proposes with nobody signed in (runner.ts proposeAsCentre). */
export function trialProposal(payload: unknown, locale: Locale) {
  const parsed = parseTrial(payload);
  return { kind: 'centre_book_trial', payload: parsed as unknown as Record<string, unknown>, summary: trialSummary(parsed, locale), expiresInHours: 96 };
}

export function registerMessageActions(): void {
  registerActionKind<FamilyMessage>({
    kind: 'centre_parent_message',
    area: 'centre',
    approverRoles: ['owner', 'admin'],
    parse: parseFamily,
    summary: (p, locale) => pick(locale, {
      en: p.to === 'student' ? `Message to ${p.student_name}` : `Message to ${p.student_name}’s parent`,
      uz: p.to === 'student' ? `${p.student_name}ga xabar` : `${p.student_name}ning ota-onasiga xabar`,
      ru: p.to === 'student' ? `Сообщение ученику: ${p.student_name}` : `Сообщение родителю ученика: ${p.student_name}`,
    }),
    display: (p) => ({ to: p.to === 'student' ? p.student_name : (p.recipient ?? 'primary guardian (chosen when sent)'), student: p.student_name, channel: p.to === 'student' ? 'Academy chat' : p.channel === 'telegram' ? 'Telegram (Academy)' : 'Academy parent portal', language: LANGUAGE_NAMES[p.language], message: p.message }),
    async run(ctx, p, action) {
      const client = academyClient(ctx, p.academy_id);
      if (p.to === 'student') {
        const sent = await client.post('send_message', { contact_id: p.contact_id, content: p.message });
        return { sent: true, channel: 'academy_chat', conversation_id: String(sent.conversation_id ?? '') };
      }
      let relationship = p.relationship_id;
      if (!relationship) {
        const guardians = (await guardiansOf(client, p.contact_id)).filter((row) => row.consent && row.can_message && (p.channel !== 'telegram' || row.telegram));
        relationship = (guardians.find((row) => row.primary) ?? guardians[0])?.relationship_id ?? null;
        if (!relationship) throw new SchoodAIError('no_guardian', 'No guardian of this student can receive messages on this channel in Academy.', 409);
      }
      const key = `schood-ai:${action.id}`;
      if (p.channel === 'inapp') {
        const sent = await client.post('send_guardian_message', { relationship_id: relationship, body: p.message, idempotency_key: key });
        return { sent: true, channel: 'academy_portal', message_id: String(asRecord(sent.message).id ?? '') };
      }
      const queued = await client.post('queue_guardian_notification', { relationship_id: relationship, event_key: 'academy_message', channel: 'telegram', body: p.message, dedupe_key: key, idempotency_key: key });
      return { sent: true, channel: 'academy_telegram', notification_id: String(asRecord(queued.notification).id ?? ''), deduplicated: queued.deduplicated === true };
    },
    retrySafe: true,
    expiresInHours: 72,
  });

  registerActionKind<LeadMessage>({
    kind: 'centre_lead_message',
    area: 'centre',
    approverRoles: ['owner', 'admin'],
    parse: parseLead,
    summary: (p, locale) => pick(locale, { en: `Follow up with ${p.lead_name}`, uz: `${p.lead_name} bilan bog‘lanish`, ru: `Повторный контакт: ${p.lead_name}` }),
    display: (p) => ({ lead: p.lead_name, channel: p.channel === 'centre_bot' ? 'Centre Telegram bot' : 'You send it yourself; approving logs it in Academy', language: LANGUAGE_NAMES[p.language], message: p.message, ...(p.next_follow_up_at ? { next_follow_up: p.next_follow_up_at } : {}) }),
    async run(ctx, p, action) {
      const deps = await centreDeps(ctx);
      let sent = false;
      if (p.channel === 'centre_bot') {
        const access = await ctx.workspace();
        const thread = p.thread_id ? await deps.store.table('threads').get({ id: p.thread_id, workspace_id: access.workspace.id }) : null;
        const token = await botToken(deps, access.workspace.id);
        if (!thread || thread.channel !== 'telegram' || !token) throw new SchoodAIError('bot_unavailable', 'The centre’s Telegram bot cannot reach this lead.', 409);
        sent = await sendText(deps, token, thread.external_id, p.message) !== null;
        if (!sent) throw new SchoodAIError('telegram_failed', 'Telegram did not accept the message.', 502);
        await deps.store.table('admissions_messages').insert({ thread_id: thread.id, workspace_id: thread.workspace_id, role: 'staff', content: p.message.slice(0, 4000), author_id: ctx.user.id, flags: { action_id: action.id } });
      }
      await academyClient(ctx, p.academy_id).post('record_lead_activity', {
        lead_id: p.lead_id, idempotency_key: `schood-ai:${action.id}`, activity_type: 'follow_up', method: p.channel === 'centre_bot' ? 'telegram' : 'other', status: 'completed',
        completed_at: ctx.now().toISOString(), notes: p.message.slice(0, 900), ...(p.next_follow_up_at ? { next_follow_up_at: p.next_follow_up_at } : {}),
      });
      return { sent, logged: true };
    },
    retrySafe: false,
    expiresInHours: 72,
  });

  registerActionKind<TrialBooking>({
    kind: 'centre_book_trial',
    area: 'centre',
    approverRoles: ['owner', 'admin'],
    parse: parseTrial,
    summary: trialSummary,
    display: (p) => ({
      name: p.name, ...(p.phone ? { phone: p.phone } : {}), ...(p.telegram ? { telegram: p.telegram } : {}), ...(p.age ? { age: String(p.age) } : {}), ...(p.interest ? { interest: p.interest } : {}),
      time: `${when(p.starts_at, p.language)} (${Math.round((Date.parse(p.ends_at) - Date.parse(p.starts_at)) / 60_000)} min)`, academy: p.academy_id ? (p.lead_id ? 'Trial for the existing Academy lead' : 'New Academy lead and trial') : 'Schood AI booking only (Academy not connected)',
      ...(p.confirm_message ? { confirmation: p.confirm_message } : {}),
    }),
    async run(ctx, p, action) {
      const deps = await centreDeps(ctx);
      const access = await ctx.workspace();
      const booking = await deps.store.table('bookings').get({ id: p.booking_id, workspace_id: access.workspace.id });
      if (!booking) throw new SchoodAIError('not_found', 'The booking no longer exists.', 404);
      if (booking.status === 'cancelled') throw new SchoodAIError('booking_cancelled', 'This booking was cancelled.', 409);
      let leadId = booking.academy_lead_id ?? p.lead_id, trialId = booking.academy_trial_id;
      if (p.academy_id) {
        const client = academyClient(ctx, p.academy_id);
        if (!leadId) {
          const created = await client.post('create_lead', {
            idempotency_key: `schood-ai:lead:${action.id}`, full_name: p.name, ...(p.phone ? { phone: p.phone } : {}), ...(p.telegram ? { telegram: p.telegram } : {}),
            ...(p.age ? { age: p.age } : {}), ...(p.interest ? { interested_course: p.interest } : {}), source_key: p.source === 'manual' ? 'manual' : p.source, notes: 'Booked through the Schood AI admissions agent.',
          });
          leadId = String(asRecord(created.lead).id ?? '');
          if (!leadId) throw new SchoodAIError('academy_unavailable', 'Academy did not return the lead.', 502);
          await deps.store.table('bookings').update({ id: booking.id }, { academy_lead_id: leadId });
        }
        if (!trialId) {
          const trial = await client.post('schedule_trial', {
            lead_id: leadId, starts_at: p.starts_at, ends_at: p.ends_at, idempotency_key: `schood-ai:trial:${action.id}`,
            ...(p.classroom_id ? { classroom_id: p.classroom_id } : {}), ...(p.teacher_user_id ? { teacher_user_id: p.teacher_user_id } : {}),
          });
          trialId = String(asRecord(trial.trial).id ?? '');
          await deps.store.table('bookings').update({ id: booking.id }, { academy_trial_id: trialId || null });
        }
      }
      const flags = asRecord(booking.contact);
      let confirmed = flags.confirmation_sent === true;
      if (p.confirm_message && !confirmed && booking.thread_id) {
        const thread = await deps.store.table('threads').get({ id: booking.thread_id });
        const token = thread?.channel === 'telegram' ? await botToken(deps, access.workspace.id) : null;
        if (thread?.channel === 'telegram' && token) confirmed = await sendText(deps, token, thread.external_id, p.confirm_message) !== null;
        if (thread) await deps.store.table('admissions_messages').insert({ thread_id: thread.id, workspace_id: thread.workspace_id, role: 'staff', content: p.confirm_message.slice(0, 4000), author_id: ctx.user.id, flags: { action_id: action.id } });
        if (thread?.channel === 'widget') confirmed = true;
        if (thread) await deps.store.table('threads').update({ id: thread.id }, { status: 'booked', ...(leadId ? { academy_lead_id: leadId } : {}) });
      }
      await deps.store.table('bookings').update({ id: booking.id }, { status: p.academy_id ? 'synced' : 'confirmed', contact: { ...flags, confirmation_sent: confirmed } });
      return { booking: booking.id, academy_lead_id: leadId ?? '', academy_trial_id: trialId ?? '', confirmation_sent: confirmed };
    },
    retrySafe: true,
    expiresInHours: 96,
  });
}

// --- T8 parent messages --------------------------------------------------------------------------

const purposeText: Record<string, string> = {
  progress: 'a short progress update', attendance: 'a note about attendance', homework: 'a note about homework', praise: 'praise for good work',
  payment: 'a polite reminder that the family should check the payment with the office (never state amounts that are not in the data)', meeting: 'an invitation to talk with the teacher', other: 'the teacher’s note',
};

/** POST centre/parent-draft { contact_id, purpose, language, note?, channel? }: a T8 draft proposed for Approve & run. */
export async function parentDraft(ctx: RequestContext) {
  const centre = await requireCentre(ctx, ['owner', 'admin', 'teacher']);
  await ctx.requireFeature('T8');
  const body = record(await ctx.body());
  const contactId = text(body.contact_id, 'contact_id', { max: 64 }), purpose = oneOf(body.purpose, 'purpose', PURPOSES), language = oneOf(body.language, 'language', LANGS);
  const channel = oneOf(body.channel ?? 'telegram', 'channel', ['telegram', 'inapp'] as const);
  const note = optionalText(body.note, 'note', { max: 1000 });
  const client = centreAcademy(ctx, centre.access.workspace);
  const record_ = await studentRecord(client, contactId);
  // Office roles can see guardians in Academy; for teachers the guardian is chosen when the office approves.
  const guardians = await guardiansOf(client, contactId).catch(() => null);
  const guardian = guardians?.filter((row) => row.consent && row.can_message && (channel !== 'telegram' || row.telegram)).sort((a, b) => Number(b.primary) - Number(a.primary))[0] ?? null;
  const facts = { student: record_, centre: centre.access.workspace.name };
  const { result, credits, balance } = await draftChecked(ctx, {
    key: 'parent.message', schema: messageSchema, facts, texts: (r) => [r.message], reference: ctx.idempotencyKey ? `parent:${ctx.idempotencyKey}` : undefined,
    system: centrePrompt({
      workspace: centre.access.workspace, locale: ctx.locale,
      task: `Write ${purposeText[purpose]} from the centre to a parent about their child, in ${LANGUAGE_NAMES[language]}. Warm, short (60-140 words), specific to the record, no blame, one clear next step. Sign as the centre. Plain text, no Markdown.`,
      blocks: [{ kind: 'student_record', title: 'Student record from Academy', data: facts }],
    }),
    brief: `Draft the message about ${record_.name}.`, request: note,
  });
  const action = await ctx.actions.propose({
    kind: 'centre_parent_message',
    payload: { academy_id: centre.access.workspace.academyTenantId, contact_id: contactId, student_name: record_.name, to: 'guardian', relationship_id: guardian?.relationship_id ?? null, recipient: guardian?.name || null, channel, language, message: result.message, purpose, campaign_id: null },
  });
  return { draft: result.message, action_id: action.id, credits, balance: balance.total, guardian: guardian ? { name: guardian.name } : null };
}

// --- C3 office assistant: leads and trials -------------------------------------------------------

/** GET centre/leads: open Academy leads with stage, last contact and whether the centre's bot can reach them. */
export async function leads(ctx: RequestContext) {
  const centre = await requireCentre(ctx, ['owner', 'admin']);
  const result = await centreAcademy(ctx, centre.access.workspace).get('business_foundation');
  const stages = new Map(asList(result.stages).map((row) => [String(row.id), row]));
  const sources = new Map(asList(result.sources).map((row) => [String(row.id), row]));
  const threads = await centre.deps.store.table('threads').list({ workspace_id: centre.access.workspace.id }, { limit: 1000 });
  const byLead = new Map(threads.filter((row) => row.academy_lead_id).map((row) => [row.academy_lead_id!, row]));
  const now = ctx.now().getTime();
  const label = (value: unknown) => { const names = asRecord(value); return String(names[ctx.locale] ?? names.en ?? names.uz ?? '') || null; };
  return {
    leads: asList(result.leads).filter((row) => row.status === 'open').slice(0, 300).map((row) => {
      const stage = stages.get(String(row.current_stage_id)), thread = byLead.get(String(row.id));
      return {
        id: String(row.id), name: String(row.full_name ?? ''), phone: row.phone ?? null, telegram: row.telegram ?? null, interest: row.interested_course ?? null,
        stage: stage ? { key: String(stage.stage_key), label: label(stage.label_i18n) } : null, source: label(sources.get(String(row.source_id))?.label_i18n),
        last_contacted_at: row.last_contacted_at ?? null, next_follow_up_at: row.next_follow_up_at ?? null,
        overdue: typeof row.next_follow_up_at === 'string' && Date.parse(row.next_follow_up_at) < now, created_at: row.created_at ?? null,
        bot_thread_id: thread?.channel === 'telegram' ? thread.id : null,
      };
    }),
    trials: asList(result.trials).filter((row) => ['scheduled', 'confirmed'].includes(String(row.status))).slice(0, 100).map((row) => ({ id: String(row.id), lead_id: String(row.lead_id), starts_at: row.starts_at, status: row.status })),
  };
}

/** POST centre/lead-draft { lead_id, kind: follow_up | trial_invite, language, starts_at?, ends_at?, note? }: a C3 draft for Approve & run. */
export async function leadDraft(ctx: RequestContext) {
  const centre = await requireCentre(ctx, ['owner', 'admin']);
  await ctx.requireFeature('C3');
  const body = record(await ctx.body());
  const leadId = text(body.lead_id, 'lead_id', { max: 64 }), kind = oneOf(body.kind, 'kind', ['follow_up', 'trial_invite'] as const), language = oneOf(body.language, 'language', LANGS);
  const ws = centre.access.workspace;
  const foundation = await centreAcademy(ctx, ws).get('business_foundation');
  const lead = asList(foundation.leads).find((row) => String(row.id) === leadId);
  if (!lead) throw new SchoodAIError('not_found', 'Lead not found in Academy.', 404);
  let starts: string | null = null, ends: string | null = null;
  if (kind === 'trial_invite') {
    starts = text(body.starts_at, 'starts_at', { max: 40 }); ends = text(body.ends_at, 'ends_at', { max: 40 });
    if (!(Date.parse(ends) > Date.parse(starts)) || Date.parse(starts) < ctx.now().getTime()) throw new SchoodAIError('invalid_request', 'Choose a future time for the trial lesson.', 400, { field: 'starts_at' });
  }
  const admissions = await centre.deps.store.table('admissions').get({ workspace_id: ws.id });
  const thread = (await centre.deps.store.table('threads').list({ workspace_id: ws.id, academy_lead_id: leadId, channel: 'telegram' }, { limit: 1 }))[0] ?? null;
  const facts = {
    lead: { name: lead.full_name, interest: lead.interested_course ?? null, preferred_schedule: lead.preferred_schedule ?? null, age: lead.age ?? null, notes: lead.notes ?? null, last_contacted_at: lead.last_contacted_at ?? null },
    centre: ws.name, prices: admissions?.prices ?? [], ...(starts ? { trial_time: when(starts, language), trial_starts_at: starts } : {}),
  };
  const task = kind === 'follow_up'
    ? `Write a short, friendly follow-up message from the centre to a prospective student (or their parent) in ${LANGUAGE_NAMES[language]}: remind them of their interest, answer nothing that is not in the data, and invite them to a free or paid trial lesson only as the data allows. 40-110 words, plain text.`
    : `Write a message in ${LANGUAGE_NAMES[language]} inviting a prospective student to a trial lesson at the time in the data (use exactly that time), asking them to confirm. 30-90 words, plain text.`;
  const { result, credits, balance } = await draftChecked(ctx, {
    key: 'office.draft', schema: messageSchema, facts, texts: (r) => [r.message], free: 31,
    system: centrePrompt({ workspace: ws, locale: ctx.locale, task, blocks: [{ kind: 'lead', title: 'Lead from Academy', data: facts }] }),
    brief: `Draft the message for ${String(lead.full_name)}.`, request: optionalText(body.note, 'note', { max: 800 }),
  });
  let action;
  if (kind === 'follow_up') {
    action = await ctx.actions.propose({ kind: 'centre_lead_message', payload: { academy_id: ws.academyTenantId, lead_id: leadId, lead_name: String(lead.full_name), channel: thread ? 'centre_bot' : 'manual', thread_id: thread?.id ?? null, language, message: result.message, next_follow_up_at: null } });
  } else {
    const booking = await centre.deps.store.table('bookings').insert({ workspace_id: ws.id, thread_id: thread?.id ?? null, starts_at: new Date(starts!).toISOString(), ends_at: new Date(ends!).toISOString(), status: 'requested', mode: 'staff', contact: { name: lead.full_name, phone: lead.phone ?? null } });
    action = await ctx.actions.propose({
      kind: 'centre_book_trial',
      payload: { booking_id: booking.id, academy_id: ws.academyTenantId, lead_id: leadId, name: String(lead.full_name), phone: typeof lead.phone === 'string' && /^\+?[0-9 ()-]{7,20}$/.test(lead.phone) ? lead.phone : null, telegram: null, age: null, interest: lead.interested_course ?? null, starts_at: starts, ends_at: ends, classroom_id: null, teacher_user_id: null, language, confirm_message: thread ? result.message : null, source: 'manual' },
    });
    await centre.deps.store.table('bookings').update({ id: booking.id }, { action_id: action.id });
  }
  return { draft: result.message, action_id: action.id, credits, balance: balance.total, reaches: thread ? 'centre_bot' : 'manual' };
}

// --- C11 win-back and renewal campaigns ----------------------------------------------------------

interface AudienceEntry { contact_id: string; name: string; reason: string; signals: Record<string, unknown> }

async function campaignAudience(ctx: RequestContext, kind: 'winback' | 'renewal', limit: number): Promise<AudienceEntry[]> {
  const centre = await requireCentre(ctx, ['owner', 'admin']);
  const client = centreAcademy(ctx, centre.access.workspace);
  const [bi, alerts, contacts] = await Promise.all([
    client.get('business_intelligence').catch(() => ({} as Record<string, unknown>)),
    client.get('alerts').catch(() => ({} as Record<string, unknown>)),
    kind === 'winback' ? client.get('contacts', { limit: '300' }).catch(() => ({} as Record<string, unknown>)) : Promise.resolve({} as Record<string, unknown>),
  ]);
  const intelligence = new Map(asList(bi.student_intelligence).map((row) => [String(row.contact_id), row]));
  const out = new Map<string, AudienceEntry>();
  const add = (id: string, name: string | null, reason: string, signals: Record<string, unknown>) => { if (!out.has(id)) out.set(id, { contact_id: id, name: name || 'Student', reason, signals }); };
  if (kind === 'winback') {
    for (const row of asList(alerts.alerts)) {
      if (row.type !== 'at_risk' || row.resolved === true) continue;
      const meta = asRecord(row.metadata), info = intelligence.get(String(row.contact_id)) ?? {};
      add(String(row.contact_id), personName(info), 'at_risk', { attendance_rate: num(meta.attendance_rate), missing_homework: num(meta.missing) });
    }
    for (const row of intelligence.values()) {
      if (['high', 'critical'].includes(String(row.latest_risk_level))) add(String(row.contact_id), personName(row), 'high_risk', { risk_level: row.latest_risk_level, attendance_30d_percent: num(row.attendance_30d_percent), homework_activity_30d: num(row.homework_activity_30d) });
    }
    for (const row of asList(contacts.contacts)) {
      if (['inactive', 'paused'].includes(String(row.status))) add(String(row.id), personName(row), 'lapsed', { status: row.status, last_activity_at: row.last_activity_at ?? null });
    }
  } else {
    const soon = ctx.now().getTime() + 21 * 86_400_000;
    for (const row of asList(bi.renewals)) {
      if (!['open', 'pending', 'due'].includes(String(row.status ?? 'open'))) continue;
      const due = typeof row.renewal_due_on === 'string' ? Date.parse(row.renewal_due_on) : NaN;
      if (Number.isFinite(due) && due > soon) continue;
      const info = intelligence.get(String(row.contact_id)) ?? {};
      add(String(row.contact_id), personName(info), 'renewal_due', { renewal_due_on: row.renewal_due_on ?? null, attendance_30d_percent: num(info.attendance_30d_percent) });
    }
    for (const row of asList(bi.subscriptions)) {
      const ends = typeof row.ends_on === 'string' ? Date.parse(row.ends_on) : NaN;
      if (row.status === 'active' && Number.isFinite(ends) && ends <= soon) add(String(row.contact_id), personName(intelligence.get(String(row.contact_id)) ?? {}), 'subscription_ending', { ends_on: row.ends_on });
    }
  }
  return [...out.values()].slice(0, limit);
}

const campaignJson = (row: CampaignRow) => ({ id: row.id, kind: row.kind, status: row.status, audience: row.audience, action_ids: row.action_ids, created_at: row.created_at });

export const campaigns = {
  async GET(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    const id = ctx.query.get('id');
    if (id) {
      const row = await centre.deps.store.table('campaigns').get({ id: uuid(id, 'id'), workspace_id: centre.access.workspace.id });
      if (!row) throw new SchoodAIError('not_found', 'Campaign not found.', 404);
      return { campaign: campaignJson(row) };
    }
    return { campaigns: (await centre.deps.store.table('campaigns').list({ workspace_id: centre.access.workspace.id }, { order: 'created_at', desc: true, limit: 50 })).map(campaignJson) };
  },
  /** { kind }: finds the audience from Academy signals. Nothing is drafted or sent yet. */
  async POST(ctx: RequestContext) {
    const centre = await requireCentre(ctx, ['owner', 'admin']);
    await ctx.requireFeature('C11');
    const kind = oneOf(record(await ctx.body()).kind, 'kind', ['winback', 'renewal'] as const);
    const audience = await campaignAudience(ctx, kind, 60);
    const row = await centre.deps.store.table('campaigns').insert({ workspace_id: centre.access.workspace.id, kind, audience: audience as unknown[], created_by: ctx.user.id });
    await ctx.audit('centre.campaign_created', { kind, audience: audience.length }, { type: 'campaign', id: row.id });
    return { campaign: campaignJson(row) };
  },
};

/** POST centre/campaign-draft { campaign_id, contact_ids, language, channel? }: one personal draft per person, each proposed for Approve & run. */
export async function campaignDraft(ctx: RequestContext) {
  const centre = await requireCentre(ctx, ['owner', 'admin']);
  await ctx.requireFeature('C11');
  const body = record(await ctx.body());
  const campaign = await centre.deps.store.table('campaigns').get({ id: uuid(body.campaign_id, 'campaign_id'), workspace_id: centre.access.workspace.id });
  if (!campaign) throw new SchoodAIError('not_found', 'Campaign not found.', 404);
  const language = oneOf(body.language, 'language', LANGS), channel = oneOf(body.channel ?? 'telegram', 'channel', ['telegram', 'inapp'] as const);
  const wanted = new Set(stringList(body.contact_ids, 'contact_ids', { max: 30, pattern: /^[A-Za-z0-9-]{1,64}$/ }));
  const audience = (campaign.audience as unknown as AudienceEntry[]).filter((entry) => wanted.has(entry.contact_id));
  const ws = centre.access.workspace;
  const drafted: { contact_id: string; action_id: string }[] = [];
  let stopped: string | null = null;
  for (const person of audience) {
    try {
      const facts = { student: person.name, reason: person.reason, signals: person.signals, centre: ws.name };
      const task = campaign.kind === 'winback'
        ? `Write a personal, caring message from the centre to the parent of a student who is at risk of dropping out or has stopped coming, in ${LANGUAGE_NAMES[language]}. Mention what the data shows without blame, show what the student would keep by returning, and offer a talk with the teacher. No discounts or offers that are not in the data. 50-120 words, plain text.`
        : `Write a short, honest renewal reminder from the centre to the parent of a student whose course period ends soon, in ${LANGUAGE_NAMES[language]}. Mention the student's progress only from the data and invite them to continue. No prices or discounts that are not in the data. 40-100 words, plain text.`;
      const { result } = await draftChecked(ctx, {
        key: 'winback.message', schema: messageSchema, facts, texts: (r) => [r.message], reference: `campaign:${campaign.id}:${person.contact_id}`,
        system: centrePrompt({ workspace: ws, locale: ctx.locale, task, blocks: [{ kind: 'signals', title: 'Academy signals for this student', data: facts }] }),
        brief: `Draft the message about ${person.name}.`,
      });
      const action = await ctx.actions.propose({
        kind: 'centre_parent_message',
        payload: { academy_id: ws.academyTenantId, contact_id: person.contact_id, student_name: person.name, to: person.reason === 'lapsed' ? 'student' : 'guardian', relationship_id: null, recipient: null, channel, language, message: result.message, purpose: campaign.kind, campaign_id: campaign.id },
      });
      drafted.push({ contact_id: person.contact_id, action_id: action.id });
    } catch (cause) {
      if (cause instanceof SchoodAIError && ['insufficient_credits', 'budget_exhausted', 'capped', 'ai_disabled', 'ai_unavailable', 'plan_required'].includes(cause.code)) { stopped = cause.code; break; }
      if (cause instanceof SchoodAIError && cause.code === 'draft_unverified') continue;
      throw cause;
    }
  }
  const ids = [...new Set([...campaign.action_ids, ...drafted.map((row) => row.action_id)])];
  await centre.deps.store.table('campaigns').update({ id: campaign.id }, { action_ids: ids, status: ids.length ? 'proposed' : campaign.status });
  return { drafted, stopped, campaign_id: campaign.id };
}

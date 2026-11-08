// HR routes of the applicant tracking layer: role templates, bulk candidates with personal
// links, the pipeline (board, list, ranking, funnel), stages, notes timeline, message texts,
// interview kits and test health. All of it is scoped to the caller's workspace. HR only.
import { SKILLS, type Skill } from '../../../../packages/company-core/src/mod.ts';
import { fetchAll } from '../insights/common.ts';
import { check, CompanyError, type Ctx, type Route } from '../types.ts';
import { EMAIL, inChunks, int, obj, oneOf, text, uuid } from '../util.ts';
import {
  CANDIDATE_COLUMNS, candidatesWithAttempts, candidateView, hiringSettings, interviewAverage, inviteLink, loadCandidate, logNote, moveStage, newInviteToken, refuseErased, trackOf,
  type CandidateRow,
} from './ats.ts';
import { ASSESSMENT_COLUMNS, loadAssessment, localeOf, type AssessmentRow, type AttemptRow } from './attempts.ts';
import { STAGES, benchmark, byFit, funnel, type Stage } from './benchmark.ts';
import { isCorrect, type ServedChoice } from './engine.ts';
import { attemptsOf, newLink, sweep } from './hr.ts';
import { generateKit } from './interview.ts';
import { MESSAGE_KINDS, MESSAGE_LOCALES, renderMessage, type CustomTemplates, type MessageKind, type MessageLocale } from './messages.ts';
import { roleTemplate, ROLE_TEMPLATES, templateView } from './roleTemplates.ts';
import { HR, assessmentView, csvCell, networkMatches, readAssessment, stats } from './shared.ts';

export const MAX_BULK_ROWS = 500;
export const MAX_BULK_MOVES = 200;
const MAX_LISTED = 500;

async function hiringTest(ctx: Ctx, id: string): Promise<AssessmentRow> {
  const row = await loadAssessment(ctx, ctx.org!.id, uuid(id, 'assessment'));
  if (row.kind !== 'hiring') throw new CompanyError('assessment_not_found', 'This test was not found.', 404);
  return row;
}

const localeFrom = (ctx: Ctx, value: unknown): MessageLocale => oneOf(value, MESSAGE_LOCALES, 'locale', localeOf(ctx.org!));

function messageFor(kind: MessageKind, locale: MessageLocale, candidate: Pick<CandidateRow, 'name'>, ctx: Ctx, assessment: AssessmentRow, link: string | null, custom: CustomTemplates) {
  return renderMessage(kind, locale, { name: candidate.name, company: ctx.org!.name, test: assessment.title, link, minutes: assessment.time_limit_minutes, closes_at: assessment.closes_at }, custom);
}

/** Reads the ids of a bulk request. */
function idList(value: unknown, max: number): string[] {
  if (!Array.isArray(value) || !value.length || value.length > max) throw new CompanyError('invalid_field', `Choose 1 to ${max} candidates.`, 400, { field: 'ids', max });
  return [...new Set(value.map((id) => uuid(id, 'ids')))];
}

async function candidatesByIds(ctx: Ctx, ids: string[]): Promise<CandidateRow[]> {
  return await inChunks(ids, (chunk) => fetchAll<CandidateRow>(() => ctx.db.from('company_candidates').select(CANDIDATE_COLUMNS).eq('org_id', ctx.org!.id).in('id', chunk).order('id')));
}

/** Attempts behind a list of candidates, only the status columns. */
async function statusesOf(ctx: Ctx, rows: CandidateRow[]): Promise<Map<string, string>> {
  const ids = rows.map((row) => row.attempt_id).filter((id): id is string => Boolean(id));
  const attempts = await inChunks(ids, (chunk) => fetchAll<{ id: string; status: string }>(() => ctx.db.from('company_attempts').select('id,status').eq('org_id', ctx.org!.id).in('id', chunk).order('id')));
  return new Map(attempts.map((attempt) => [attempt.id, attempt.status]));
}

interface InviteRow { name: string; email: string | null; phone: string | null }
type RowProblem = { row: number; name: string; email: string | null; reason: 'name' | 'contact' | 'email' | 'phone' | 'duplicate' };

function readRows(value: unknown): { rows: (InviteRow & { index: number })[]; problems: RowProblem[] } {
  if (!Array.isArray(value) || !value.length || value.length > MAX_BULK_ROWS) throw new CompanyError('invalid_field', `Add 1 to ${MAX_BULK_ROWS} candidates at a time.`, 400, { field: 'rows', max: MAX_BULK_ROWS });
  const rows: (InviteRow & { index: number })[] = [], problems: RowProblem[] = [];
  value.forEach((entry, index) => {
    const raw = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    let name = '', address: string | null = null, phone: string | null = null;
    const label = typeof raw.name === 'string' ? raw.name.slice(0, 120) : '';
    const hasEmail = typeof raw.email === 'string' ? raw.email.slice(0, 200) : null;
    try {
      name = text(raw.name, 'name', { min: 2, max: 120 })!;
    } catch {
      problems.push({ row: index + 1, name: label, email: hasEmail, reason: 'name' });
      return;
    }
    try {
      address = text(raw.email, 'email', { max: 200, optional: true })?.toLowerCase() ?? null;
      if (address && !EMAIL.test(address)) throw new Error('email');
    } catch {
      problems.push({ row: index + 1, name, email: hasEmail, reason: 'email' });
      return;
    }
    try {
      phone = text(raw.phone, 'phone', { max: 40, optional: true });
      if (phone && !/^[+\d][\d\s()./-]{4,}$/.test(phone)) throw new Error('phone');
    } catch {
      problems.push({ row: index + 1, name, email: address, reason: 'phone' });
      return;
    }
    if (!address && !phone) {
      problems.push({ row: index + 1, name, email: null, reason: 'contact' });
      return;
    }
    rows.push({ index: index + 1, name, email: address, phone });
  });
  return { rows, problems };
}

function invitesCsv(rows: { name: string; email: string | null; phone: string | null; link: string | null; subject: string; text: string }[]): string {
  const header = ['Name', 'Email', 'Phone', 'Personal link', 'Subject', 'Message'];
  return `﻿${[header.map(csvCell).join(','), ...rows.map((row) => [row.name, row.email, row.phone, row.link, row.subject, row.text].map(csvCell).join(','))].join('\r\n')}\r\n`;
}

function pipelineCsv(rows: ReturnType<typeof candidateView>[], skills: Skill[]): string {
  const header = ['Name', 'Email', 'Phone', 'Stage', 'Test status', 'Verdict', 'Overall level', 'Overall score', ...skills.map((skill) => `${skill} level`), 'Minutes', 'Invited', 'Opened', 'Started', 'Submitted', 'Decision'];
  const lines = rows.map((row) => [
    row.name, row.email, row.phone, row.stage, row.track, row.benchmark.verdict, row.overall_level ?? '', row.overall_score ?? '',
    ...skills.map((skill) => row.benchmark.skills.find((entry) => entry.skill === skill)?.level ?? ''), row.minutes ?? '', row.invited_at, row.opened_at, row.started_at, row.submitted_at, row.decision ?? '',
  ].map(csvCell).join(','));
  return `﻿${[header.map(csvCell).join(','), ...lines].join('\r\n')}\r\n`;
}

async function buildPipeline(ctx: Ctx, assessment: AssessmentRow) {
  const attempts = await sweep(ctx, assessment, await attemptsOf(ctx, assessment.id));
  const candidates = await candidatesWithAttempts(ctx, assessment.id, attempts);
  const byId = new Map(attempts.map((attempt) => [attempt.id, attempt]));
  const network = networkMatches(attempts);
  const views = candidates.map((candidate) => {
    const attempt = candidate.attempt_id ? byId.get(candidate.attempt_id) ?? null : null;
    return candidateView(candidate, attempt, assessment, attempt ? network.get(attempt.id) ?? 0 : 0);
  });
  return { attempts, views };
}

export const routes: Route[] = [
  // ----- Role templates -----
  {
    method: 'GET', path: 'orgs/:org/hiring/role-templates', access: 'org', roles: HR, allowSuspended: true,
    handle: (ctx) => Promise.resolve({ templates: ROLE_TEMPLATES.map(templateView), industry: ctx.org!.industry }),
  },
  {
    // One click: a test with the template's skills, levels and time, and a candidate link.
    method: 'POST', path: 'orgs/:org/hiring/role-templates/:code', access: 'org', roles: HR,
    async handle(ctx, params, body) {
      const input = body === undefined ? {} : obj(body);
      const template = roleTemplate(params.code);
      if (!template) throw new CompanyError('template_not_found', 'This role template was not found.', 404);
      const view = templateView(template);
      const fields = readAssessment({
        title: input.title ?? template.name, job_role: view.job_role, skills: view.skills, min_level: view.min_level,
        time_limit_minutes: view.time_limit_minutes, skill_minimums: view.skill_minimums, show_level: input.show_level === true,
      }, 'hiring', null);
      (fields.settings as Record<string, unknown>).template = template.code;
      const link = await newLink(ctx);
      const row = check<AssessmentRow>(await ctx.db.from('company_assessments').insert({
        ...fields, org_id: ctx.org!.id, kind: 'hiring', status: 'open', link_token_hash: link.hash, created_by: ctx.user,
      }).select(ASSESSMENT_COLUMNS).single());
      await ctx.audit('hiring.test_created', row.id, { title: row.title, job_role: row.job_role, template: template.code });
      return { assessment: assessmentView(row), link: link.url };
    },
  },

  // ----- Candidates of one test -----
  {
    method: 'GET', path: 'orgs/:org/assessments/:assessment/pipeline', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx, params) {
      const assessment = await hiringTest(ctx, params.assessment);
      const { attempts, views } = await buildPipeline(ctx, assessment);
      const notes = await inChunks(views.map((view) => view.id), (chunk) => fetchAll<{ candidate_id: string }>(() => ctx.db.from('company_candidate_notes').select('candidate_id').eq('org_id', ctx.org!.id).eq('kind', 'note').in('candidate_id', chunk).order('id')));
      const noteCounts = new Map<string, number>();
      for (const note of notes) noteCounts.set(note.candidate_id, (noteCounts.get(note.candidate_id) ?? 0) + 1);
      const ranked = [...views].sort(byFit);
      return {
        assessment: assessmentView(assessment),
        stats: stats(attempts, assessment),
        funnel: funnel(views.map((view) => ({
          invited_at: view.invited_at, opened_at: view.opened_at, created_at: view.created_at, hired_at: view.hired_at, stage: view.stage, furthest_stage: view.furthest_stage, verdict: view.benchmark.verdict,
          attempt: view.started_at ? { status: view.status!, started_at: view.started_at, submitted_at: view.submitted_at } : null,
        }))),
        candidates: ranked.map((view, index) => ({ ...view, rank: view.benchmark.verdict === 'pending' ? null : index + 1, notes_count: noteCounts.get(view.id) ?? 0 })),
      };
    },
  },
  {
    method: 'GET', path: 'orgs/:org/assessments/:assessment/pipeline/export', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx, params) {
      const assessment = await hiringTest(ctx, params.assessment);
      const { views } = await buildPipeline(ctx, assessment);
      await ctx.audit('hiring.pipeline_exported', assessment.id, { rows: views.length });
      const safe = assessment.title.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 60) || 'test';
      return { filename: `${safe}-pipeline-${ctx.now().toISOString().slice(0, 10)}.csv`, csv: pipelineCsv([...views].sort(byFit), SKILLS.filter((skill) => assessment.skills.includes(skill))) };
    },
  },
  {
    // Adds many people at once. Each gets a personal link, shown only in this answer, and a
    // ready text. Nothing is sent. Someone already on the test is reported, not added twice.
    method: 'POST', path: 'orgs/:org/assessments/:assessment/candidates', access: 'org', roles: HR,
    async handle(ctx, params, body) {
      const input = obj(body);
      const assessment = await hiringTest(ctx, params.assessment);
      if (assessment.status !== 'open') throw new CompanyError('test_closed', 'This test is closed.', 409);
      const locale = localeFrom(ctx, input.locale);
      const { rows, problems } = readRows(input.rows);
      const known = await fetchAll<{ email: string | null }>(() => ctx.db.from('company_candidates').select('email').eq('org_id', ctx.org!.id).eq('assessment_id', assessment.id).not('email', 'is', null).order('id'));
      const taken = new Set(known.map((row) => row.email));
      const fresh: (InviteRow & { index: number })[] = [];
      for (const row of rows) {
        if (row.email && taken.has(row.email)) problems.push({ row: row.index, name: row.name, email: row.email, reason: 'duplicate' });
        else {
          if (row.email) taken.add(row.email);
          fresh.push(row);
        }
      }
      const now = ctx.now().toISOString();
      const { templates } = await hiringSettings(ctx, ctx.org!.id);
      const created: { id: string; name: string; email: string | null; phone: string | null; link: string; subject: string; text: string }[] = [];
      for (let from = 0; from < fresh.length; from += 100) {
        const batch = await Promise.all(fresh.slice(from, from + 100).map(async (row) => ({ row, token: await newInviteToken() })));
        const insert = (entries: typeof batch) => ctx.db.from('company_candidates').insert(entries.map(({ row, token }) => ({
          org_id: ctx.org!.id, assessment_id: assessment.id, name: row.name, email: row.email, phone: row.phone, source: 'invite', invite_token_hash: token.hash,
          stage: 'new', furthest_stage: 'new', stage_at: now, invited_at: now, created_by: ctx.user, created_at: now,
        }))).select(CANDIDATE_COLUMNS);
        let saved: { entry: (typeof batch)[number]; row: CandidateRow }[] = [];
        const result = await insert(batch);
        if (result.error?.code === '23505') {
          // Another tab added some of them meanwhile: one at a time, so the rest still go in.
          for (const entry of batch) {
            const single = await insert([entry]);
            if (single.error?.code === '23505') problems.push({ row: entry.row.index, name: entry.row.name, email: entry.row.email, reason: 'duplicate' });
            else saved.push({ entry, row: check<CandidateRow[]>(single)[0] });
          }
        } else {
          const inserted = check<CandidateRow[]>(result);
          saved = batch.map((entry, index) => ({ entry, row: inserted[index] }));
        }
        for (const { entry, row } of saved) {
          const link = inviteLink(ctx, entry.token.raw);
          const message = messageFor('invite', locale, row, ctx, assessment, link, templates);
          created.push({ id: row.id, name: entry.row.name, email: entry.row.email, phone: entry.row.phone, link, subject: message.subject, text: message.text });
        }
      }
      problems.sort((a, b) => a.row - b.row);
      await ctx.audit('hiring.candidates_added', assessment.id, { added: created.length, problems: problems.length });
      return { created, problems, csv: created.length ? invitesCsv(created) : null };
    },
  },
  {
    // Is the test working? Completion, how long sections take, and questions nearly everyone
    // gets right or wrong. Computed on demand; only counts questions seen by at least 5 people.
    method: 'GET', path: 'orgs/:org/assessments/:assessment/health', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx, params) {
      const assessment = await hiringTest(ctx, params.assessment);
      const attempts = await attemptsOf(ctx, assessment.id);
      const closed = attempts.filter((attempt) => attempt.status === 'graded' || attempt.status === 'submitted');
      const scored = closed.filter((attempt) => !(attempt.integrity as { anonymised?: boolean })?.anonymised);
      const skills = SKILLS.filter((skill) => assessment.skills.includes(skill)).map((skill) => {
        const scores = closed.map((attempt) => attempt.skill_results[skill]?.score).filter((value): value is number => typeof value === 'number');
        const seconds = scored.map((attempt) => attempt.integrity?.section_seconds?.[skill]).filter((value): value is number => typeof value === 'number' && value > 0);
        return {
          skill,
          average: scores.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length) : null,
          average_minutes: seconds.length ? Math.round(seconds.reduce((sum, value) => sum + value, 0) / seconds.length / 6) / 10 : null,
          count: scores.length,
        };
      });
      const items = new Map<string, { id: string; prompt: string; skill: string; served: number; correct: number }>();
      for (const attempt of scored) {
        for (const section of attempt.items) {
          const served: ServedChoice[] = [...(section.stages?.flatMap((stage) => stage.items) ?? []), ...(section.passages?.flatMap((passage) => passage.questions) ?? [])];
          for (const item of served) {
            const entry = items.get(item.id) ?? { id: item.id, prompt: item.prompt, skill: section.skill, served: 0, correct: 0 };
            entry.served += 1;
            if (isCorrect(item, attempt.answers[item.id])) entry.correct += 1;
            items.set(item.id, entry);
          }
        }
      }
      const seen = [...items.values()].filter((item) => item.served >= 5);
      const flagged = seen.map((item) => ({ prompt: item.prompt, skill: item.skill, served: item.served, rate: Math.round(item.correct / item.served * 100) }))
        .filter((item) => item.rate >= 95 || item.rate <= 15).sort((a, b) => a.rate - b.rate).slice(0, 20);
      return {
        started: attempts.length,
        finished: closed.length,
        unfinished: attempts.filter((attempt) => attempt.status === 'expired').length,
        completion: attempts.length ? Math.round(closed.length / attempts.length * 100) : null,
        skills, questions_checked: seen.length, flagged,
      };
    },
  },

  // ----- Everyone, across all hiring tests -----
  {
    method: 'GET', path: 'orgs/:org/candidates', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx, _params, _body, query) {
      const needle = (query.get('search') ?? '').trim().toLowerCase().slice(0, 100);
      const stage = query.get('stage') ? oneOf<Stage>(query.get('stage'), STAGES, 'stage') : null;
      const testFilter = query.get('assessment') ? uuid(query.get('assessment'), 'assessment') : null;
      const tests = await fetchAll<AssessmentRow>(() => ctx.db.from('company_assessments').select(ASSESSMENT_COLUMNS).eq('org_id', ctx.org!.id).eq('kind', 'hiring').order('created_at', { ascending: false }).order('id'), 2000);
      const testById = new Map(tests.map((test) => [test.id, test]));
      const rows = await fetchAll<CandidateRow>(() => ctx.db.from('company_candidates').select(CANDIDATE_COLUMNS).eq('org_id', ctx.org!.id).is('anonymised_at', null).order('created_at', { ascending: false }).order('id'));
      const counts: Partial<Record<Stage, number>> = {};
      for (const row of rows) if (!testFilter || row.assessment_id === testFilter) counts[row.stage] = (counts[row.stage] ?? 0) + 1;
      const matching = rows.filter((row) => (!testFilter || row.assessment_id === testFilter) && (!stage || row.stage === stage) && (!needle || `${row.name ?? ''} ${row.email ?? ''} ${row.phone ?? ''}`.toLowerCase().includes(needle)));
      const page = matching.slice(0, MAX_LISTED);
      const attempts = await inChunks(page.map((row) => row.attempt_id).filter((id): id is string => Boolean(id)), (chunk) => fetchAll<AttemptRow>(() => ctx.db.from('company_attempts').select('id,status,started_at,submitted_at,overall_level,overall_score,skill_results').eq('org_id', ctx.org!.id).in('id', chunk).order('id')));
      const attemptById = new Map(attempts.map((attempt) => [attempt.id, attempt]));
      return {
        total: matching.length,
        counts,
        tests: tests.map((test) => ({ id: test.id, title: test.title })),
        candidates: page.flatMap((row) => {
          const test = testById.get(row.assessment_id);
          if (!test) return [];
          const attempt = row.attempt_id ? attemptById.get(row.attempt_id) ?? null : null;
          const fit = benchmark(attempt ? { status: attempt.status, overall_level: attempt.overall_level, overall_score: attempt.overall_score, skill_results: attempt.skill_results } : null, test);
          return [{
            id: row.id, name: row.name, email: row.email, phone: row.phone, stage: row.stage, stage_at: row.stage_at, assessment_id: test.id, test_title: test.title,
            track: trackOf(row, attempt), overall_level: attempt?.overall_level ?? null, overall_score: attempt?.overall_score === null || attempt?.overall_score === undefined ? null : Number(attempt.overall_score),
            verdict: fit.verdict, created_at: row.created_at, submitted_at: attempt?.submitted_at ?? null, interview_average: interviewAverage(row.interview_kit),
          }];
        }),
      };
    },
  },

  // ----- Several candidates (declared before the routes with :candidate) -----
  {
    method: 'POST', path: 'orgs/:org/candidates/bulk', access: 'org', roles: HR,
    async handle(ctx, _params, body) {
      const input = obj(body);
      const stage = oneOf<Stage>(input.stage, STAGES, 'stage');
      const rows = await candidatesByIds(ctx, idList(input.ids, MAX_BULK_MOVES));
      let moved = 0, skipped = 0;
      for (const row of rows) {
        if (row.anonymised_at) { skipped += 1; continue; }
        if (row.stage !== stage) moved += 1;
        await moveStage(ctx, row, stage);
      }
      await ctx.audit('hiring.candidates_moved', null, { stage, moved, skipped });
      return { moved, skipped };
    },
  },
  {
    // Texts for many people to copy. Invitations and reminders skip anyone who has already
    // finished. `reissue` gives a new link to those whose current one this browser did not
    // remember, which stops their old link working.
    method: 'POST', path: 'orgs/:org/candidates/bulk/messages', access: 'org', roles: HR,
    async handle(ctx, _params, body) {
      const input = obj(body);
      const kind = oneOf<MessageKind>(input.kind, MESSAGE_KINDS, 'kind');
      if (kind === 'feedback') throw new CompanyError('invalid_field', 'Feedback reports are shared one candidate at a time.', 400, { field: 'kind' });
      const locale = localeFrom(ctx, input.locale);
      const links = (input.links && typeof input.links === 'object' ? input.links : {}) as Record<string, unknown>;
      const rows = await candidatesByIds(ctx, idList(input.ids, MAX_BULK_ROWS));
      const tests = await inChunks([...new Set(rows.map((row) => row.assessment_id))], (chunk) => fetchAll<AssessmentRow>(() => ctx.db.from('company_assessments').select(ASSESSMENT_COLUMNS).eq('org_id', ctx.org!.id).in('id', chunk).order('id')));
      const testById = new Map(tests.map((test) => [test.id, test]));
      const statuses = await statusesOf(ctx, rows);
      const { templates } = await hiringSettings(ctx, ctx.org!.id);
      const needsLink = kind === 'invite' || kind === 'reminder';
      const messages: { id: string; name: string | null; email: string | null; phone: string | null; link: string | null; missing_link: boolean; subject: string; text: string }[] = [];
      let skipped = 0;
      const now = ctx.now().toISOString();
      for (const row of rows) {
        const test = testById.get(row.assessment_id);
        const status = row.attempt_id ? statuses.get(row.attempt_id) : null;
        if (!test || row.anonymised_at || (needsLink && (status === 'submitted' || status === 'graded'))) { skipped += 1; continue; }
        let link: string | null = null;
        if (needsLink) {
          const given = links[row.id];
          link = typeof given === 'string' && /^https?:\/\/\S{5,380}$/.test(given) ? given : null;
          if (!link && input.reissue === true) {
            const fresh = await newInviteToken();
            check(await ctx.db.from('company_candidates').update({ invite_token_hash: fresh.hash }).eq('id', row.id).eq('org_id', ctx.org!.id));
            link = inviteLink(ctx, fresh.raw);
          }
        }
        const message = messageFor(kind, locale, row, ctx, test, link, templates);
        messages.push({ id: row.id, name: row.name, email: row.email, phone: row.phone, link, missing_link: needsLink && !link, subject: message.subject, text: message.text });
        if (input.mark === true && kind === 'reminder' && link) {
          check(await ctx.db.from('company_candidates').update({ reminded_at: now, reminders: row.reminders + 1 }).eq('id', row.id).eq('org_id', ctx.org!.id));
        }
        if (input.mark === true) await logNote(ctx, row, 'message', null, { kind, locale });
      }
      return { messages, skipped, csv: messages.length ? invitesCsv(messages.map((row) => ({ ...row, name: row.name ?? '' }))) : null };
    },
  },

  // ----- One candidate -----
  {
    method: 'GET', path: 'orgs/:org/candidates/:candidate', access: 'org', roles: HR, allowSuspended: true,
    async handle(ctx, params) {
      const candidate = await loadCandidate(ctx, uuid(params.candidate, 'candidate'));
      const assessment = await hiringTest(ctx, candidate.assessment_id);
      const attempt = candidate.attempt_id ? check<AttemptRow | null>(await ctx.db.from('company_attempts').select('id,org_id,assessment_id,member_id,user_id,candidate_name,candidate_email,candidate_phone,status,started_at,deadline_at,submitted_at,graded_at,items,overall_level,overall_score,skill_results,ai_feedback,integrity,decision,decision_by,notes,certificate_code,created_at,updated_at').eq('id', candidate.attempt_id).eq('org_id', ctx.org!.id).maybeSingle()) : null;
      const notes = await fetchAll<{ id: string; kind: string; body: string | null; details: Record<string, unknown>; author: string | null; created_at: string }>(() => ctx.db.from('company_candidate_notes').select('id,kind,body,details,author,created_at').eq('org_id', ctx.org!.id).eq('candidate_id', candidate.id).order('created_at', { ascending: false }).order('id'), 2000);
      const authorIds = [...new Set(notes.map((note) => note.author).filter((id): id is string => Boolean(id)))];
      const people = await inChunks(authorIds, (chunk) => fetchAll<{ user_id: string; full_name: string | null; email: string | null }>(() => ctx.db.from('company_members').select('user_id,full_name,email').eq('org_id', ctx.org!.id).in('user_id', chunk).order('id')));
      const names = new Map(people.map((person) => [person.user_id, person.full_name ?? person.email]));
      // The same person on the company's other tests: worth knowing before an interview.
      const others = candidate.email ? check<{ id: string; assessment_id: string; stage: Stage; attempt_id: string | null; created_at: string }[]>(await ctx.db.from('company_candidates').select('id,assessment_id,stage,attempt_id,created_at').eq('org_id', ctx.org!.id).eq('email', candidate.email).neq('id', candidate.id).order('created_at', { ascending: false }).limit(20)) : [];
      const otherTests = await inChunks(others.map((row) => row.assessment_id), (chunk) => fetchAll<{ id: string; title: string }>(() => ctx.db.from('company_assessments').select('id,title').eq('org_id', ctx.org!.id).in('id', chunk).order('id')));
      const otherAttempts = await inChunks(others.map((row) => row.attempt_id).filter((id): id is string => Boolean(id)), (chunk) => fetchAll<{ id: string; overall_level: string | null }>(() => ctx.db.from('company_attempts').select('id,overall_level').eq('org_id', ctx.org!.id).in('id', chunk).order('id')));
      return {
        other_applications: others.map((row) => ({ id: row.id, stage: row.stage, created_at: row.created_at, test_title: otherTests.find((test) => test.id === row.assessment_id)?.title ?? '', overall_level: otherAttempts.find((entry) => entry.id === row.attempt_id)?.overall_level ?? null })),
        candidate: candidateView(candidate, attempt ? { ...attempt, answers: {} } as AttemptRow : null, assessment),
        assessment: assessmentView(assessment),
        interview_kit: candidate.interview_kit,
        feedback: attempt ? { writing: attempt.ai_feedback?.writing ?? null, speaking: attempt.ai_feedback?.speaking ?? null } : null,
        notes: notes.map((note) => ({ id: note.id, kind: note.kind, body: note.body, details: note.details, created_at: note.created_at, author_name: note.author ? names.get(note.author) ?? null : null, mine: note.author === ctx.user })),
      };
    },
  },
  {
    method: 'PATCH', path: 'orgs/:org/candidates/:candidate', access: 'org', roles: HR,
    async handle(ctx, params, body) {
      const input = obj(body);
      let candidate = await loadCandidate(ctx, uuid(params.candidate, 'candidate'));
      refuseErased(candidate);
      const patch: Record<string, unknown> = {};
      if (input.name !== undefined) patch.name = text(input.name, 'name', { min: 2, max: 120 });
      if (input.phone !== undefined) patch.phone = text(input.phone, 'phone', { max: 40, optional: true });
      if (input.email !== undefined) {
        const address = text(input.email, 'email', { max: 200, optional: true })?.toLowerCase() ?? null;
        if (address && !EMAIL.test(address)) throw new CompanyError('invalid_field', 'email is not an email address.', 400, { field: 'email' });
        patch.email = address;
      }
      if (Object.keys(patch).length) {
        const result = await ctx.db.from('company_candidates').update(patch).eq('id', candidate.id).eq('org_id', ctx.org!.id).select(CANDIDATE_COLUMNS).maybeSingle();
        if (result.error?.code === '23505') throw new CompanyError('candidate_exists', 'Someone with this email is already on this test.', 409);
        candidate = check<CandidateRow>(result);
      }
      if (input.stage !== undefined) candidate = await moveStage(ctx, candidate, oneOf<Stage>(input.stage, STAGES, 'stage'));
      await ctx.audit('hiring.candidate_updated', candidate.id, { stage: input.stage ?? null, contact: Object.keys(patch) });
      return { stage: candidate.stage, stage_at: candidate.stage_at, name: candidate.name, email: candidate.email, phone: candidate.phone };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/candidates/:candidate/notes', access: 'org', roles: HR,
    async handle(ctx, params, body) {
      const candidate = await loadCandidate(ctx, uuid(params.candidate, 'candidate'));
      refuseErased(candidate);
      const note = text(obj(body).body, 'body', { min: 1, max: 4000 })!;
      const row = check<{ id: string; created_at: string }>(await ctx.db.from('company_candidate_notes').insert({ org_id: ctx.org!.id, candidate_id: candidate.id, author: ctx.user, kind: 'note', body: note, created_at: ctx.now().toISOString() }).select('id,created_at').single());
      await ctx.audit('hiring.candidate_note', candidate.id);
      return { note: { id: row.id, kind: 'note', body: note, details: {}, created_at: row.created_at, author_name: ctx.member?.full_name ?? ctx.member?.email ?? null, mine: true } };
    },
  },
  {
    method: 'DELETE', path: 'orgs/:org/candidates/:candidate/notes/:note', access: 'org', roles: HR,
    async handle(ctx, params) {
      const candidate = await loadCandidate(ctx, uuid(params.candidate, 'candidate'));
      const noteId = uuid(params.note, 'note');
      const note = check<{ id: string; author: string | null; kind: string } | null>(await ctx.db.from('company_candidate_notes').select('id,author,kind').eq('id', noteId).eq('candidate_id', candidate.id).eq('org_id', ctx.org!.id).maybeSingle());
      if (!note || note.kind !== 'note') throw new CompanyError('note_not_found', 'This note was not found.', 404);
      if (note.author !== ctx.user && ctx.member?.role !== 'owner' && !ctx.staff) throw new CompanyError('forbidden', 'Only the author or the owner can delete a note.', 403);
      check(await ctx.db.from('company_candidate_notes').delete().eq('id', note.id).eq('org_id', ctx.org!.id));
      await ctx.audit('hiring.candidate_note_deleted', candidate.id);
      return { ok: true };
    },
  },
  {
    // A new personal link. The old one stops working at once, which is why HR asks for it.
    method: 'POST', path: 'orgs/:org/candidates/:candidate/link', access: 'org', roles: HR,
    async handle(ctx, params) {
      const candidate = await loadCandidate(ctx, uuid(params.candidate, 'candidate'));
      refuseErased(candidate);
      const fresh = await newInviteToken();
      check(await ctx.db.from('company_candidates').update({ invite_token_hash: fresh.hash }).eq('id', candidate.id).eq('org_id', ctx.org!.id));
      await ctx.audit('hiring.candidate_link', candidate.id);
      return { link: inviteLink(ctx, fresh.raw) };
    },
  },
  {
    // A text to copy, never sent by Schood. `mark` records in the timeline that HR used it.
    method: 'POST', path: 'orgs/:org/candidates/:candidate/message', access: 'org', roles: HR,
    async handle(ctx, params, body) {
      const input = obj(body);
      const kind = oneOf<MessageKind>(input.kind, MESSAGE_KINDS, 'kind');
      const locale = localeFrom(ctx, input.locale);
      const candidate = await loadCandidate(ctx, uuid(params.candidate, 'candidate'));
      refuseErased(candidate);
      const assessment = await hiringTest(ctx, candidate.assessment_id);
      const given = text(input.link, 'link', { max: 400, optional: true });
      if (given && !/^https?:\/\/\S+$/.test(given)) throw new CompanyError('invalid_field', 'link must be a web address.', 400, { field: 'link' });
      const { templates } = await hiringSettings(ctx, ctx.org!.id);
      const message = messageFor(kind, locale, candidate, ctx, assessment, given, templates);
      if (input.mark === true) {
        // Copying twice within a minute is one reminder, not two.
        const recent = candidate.reminded_at && ctx.now().getTime() - Date.parse(candidate.reminded_at) < 60_000;
        if (kind === 'reminder' && !recent) {
          check(await ctx.db.from('company_candidates').update({ reminded_at: ctx.now().toISOString(), reminders: candidate.reminders + 1 }).eq('id', candidate.id).eq('org_id', ctx.org!.id));
        }
        if (kind !== 'reminder' || !recent) await logNote(ctx, candidate, 'message', null, { kind, locale });
      }
      return { subject: message.subject, text: message.text, needs_link: (kind === 'invite' || kind === 'reminder' || kind === 'feedback') && !given };
    },
  },
  {
    // The interviewer's scorecard: a score out of 5 per question and a short summary.
    method: 'PATCH', path: 'orgs/:org/candidates/:candidate/interview-kit', access: 'org', roles: HR,
    async handle(ctx, params, body) {
      const input = obj(body);
      const candidate = await loadCandidate(ctx, uuid(params.candidate, 'candidate'));
      refuseErased(candidate);
      const kit = candidate.interview_kit;
      if (!kit) throw new CompanyError('no_interview_kit', 'Prepare the interview questions first.', 409);
      const ratings: Record<string, number> = {};
      if (input.ratings !== undefined) {
        if (!input.ratings || typeof input.ratings !== 'object' || Array.isArray(input.ratings)) throw new CompanyError('invalid_field', 'ratings must be an object.', 400, { field: 'ratings' });
        for (const [position, value] of Object.entries(input.ratings)) {
          const index = int(position, 'ratings', { min: 0, max: kit.questions.length - 1 })!;
          if (value !== null) ratings[String(index)] = int(value, 'ratings', { min: 1, max: 5 })!;
        }
      }
      const updated = { ...kit, ratings: input.ratings === undefined ? kit.ratings ?? {} : ratings, summary: input.summary === undefined ? kit.summary ?? null : text(input.summary, 'summary', { max: 2000, optional: true }) };
      check(await ctx.db.from('company_candidates').update({ interview_kit: updated }).eq('id', candidate.id).eq('org_id', ctx.org!.id));
      const average = interviewAverage(updated);
      if (average !== interviewAverage(kit)) await logNote(ctx, candidate, 'system', null, { kind: 'interview_score', average });
      await ctx.audit('hiring.interview_scored', candidate.id, { average });
      return { kit: updated, average };
    },
  },
  {
    // Follow-up questions for this person: kept, so reopening costs no AI. `fresh` asks for a new set.
    method: 'POST', path: 'orgs/:org/candidates/:candidate/interview-kit', access: 'org', roles: HR,
    async handle(ctx, params, body) {
      const input = body === undefined ? {} : obj(body);
      const locale = localeFrom(ctx, input.locale);
      const candidate = await loadCandidate(ctx, uuid(params.candidate, 'candidate'));
      refuseErased(candidate);
      if (candidate.interview_kit && input.fresh !== true && candidate.interview_kit.locale === locale) return { kit: candidate.interview_kit };
      const assessment = await hiringTest(ctx, candidate.assessment_id);
      const attempt = candidate.attempt_id ? check<AttemptRow | null>(await ctx.db.from('company_attempts').select('id,status,overall_level,overall_score,skill_results,ai_feedback').eq('id', candidate.attempt_id).eq('org_id', ctx.org!.id).maybeSingle()) : null;
      const fit = benchmark(attempt ? { status: attempt.status, overall_level: attempt.overall_level, overall_score: attempt.overall_score, skill_results: attempt.skill_results } : null, assessment);
      const kit = await generateKit(ctx, { jobRole: assessment.job_role, title: assessment.title, fit, attempt, locale, seed: `${candidate.id}:${ctx.now().toISOString().slice(0, input.fresh === true ? 19 : 0)}` });
      check(await ctx.db.from('company_candidates').update({ interview_kit: kit }).eq('id', candidate.id).eq('org_id', ctx.org!.id));
      await ctx.audit('hiring.interview_kit', candidate.id, { source: kit.source });
      return { kit };
    },
  },
];

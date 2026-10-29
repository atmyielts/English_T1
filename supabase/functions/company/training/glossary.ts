// The company's own glossary: HR adds terms (one by one or from CSV), employees
// practise them with flashcards and a quiz, which logs `glossary` activity.
import { HR_ROLES } from '../../../../packages/company-core/src/mod.ts';
import { logActivity } from '../core.ts';
import { check, CompanyError, type Ctx, type Route } from '../types.ts';
import { obj, oneOf, text, uuid } from '../util.ts';
import { isHr, learner, minutesSpent } from './shared.ts';

export const MAX_TERMS = 2000;
export const MAX_IMPORT_ROWS = 500;

export interface TermRow { id: string; org_id: string; term: string; meaning: string; ru: string | null; uz: string | null; example: string | null; department_id: string | null; created_at?: string; updated_at?: string }
const COLUMNS = 'id,org_id,term,meaning,ru,uz,example,department_id,created_at,updated_at';

interface TermInput { term: string; meaning: string; ru: string | null; uz: string | null; example: string | null; department_id: string | null }

function readTerm(input: Record<string, unknown>, departments: Set<string>): TermInput {
  const department = input.department_id === undefined || input.department_id === null || input.department_id === '' ? null : uuid(input.department_id, 'department_id');
  if (department && !departments.has(department)) throw new CompanyError('invalid_field', 'department_id is not a department of this workspace.', 400, { field: 'department_id' });
  return {
    term: text(input.term, 'term', { min: 1, max: 120 })!,
    meaning: text(input.meaning, 'meaning', { min: 1, max: 400 })!,
    ru: text(input.ru, 'ru', { max: 200, optional: true }),
    uz: text(input.uz, 'uz', { max: 200, optional: true }),
    example: text(input.example, 'example', { max: 400, optional: true }),
    department_id: department,
  };
}

async function departmentIds(ctx: Ctx): Promise<Map<string, string>> {
  const rows = check<{ id: string; name: string }[]>(await ctx.db.from('company_departments').select('id,name').eq('org_id', ctx.org!.id));
  return new Map(rows.map((row) => [row.id, row.name]));
}

async function allTerms(ctx: Ctx): Promise<TermRow[]> {
  return check<TermRow[]>(await ctx.db.from('company_glossary_terms').select(COLUMNS).eq('org_id', ctx.org!.id).order('term'));
}

const key = (term: string) => term.trim().toLowerCase();

/** Splits CSV text (comma, semicolon or tab separated; quotes allowed) into rows of cells. */
export function parseCsv(source: string): string[][] {
  const textValue = source.replace(/^﻿/, '');
  const firstLine = textValue.split(/\r?\n/, 1)[0] ?? '';
  const counts = { ',': 0, ';': 0, '\t': 0 } as Record<string, number>;
  let quoted = false;
  for (const char of firstLine) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && char in counts) counts[char]++;
  }
  const delimiter = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][1] > 0 ? Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] : ',';
  const rows: string[][] = [];
  let row: string[] = [], cell = '', inQuotes = false;
  for (let index = 0; index < textValue.length; index++) {
    const char = textValue[index];
    if (inQuotes) {
      if (char === '"' && textValue[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') inQuotes = false;
      else cell += char;
    } else if (char === '"' && cell === '') inQuotes = true;
    else if (char === delimiter) { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && textValue[index + 1] === '\n') index++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += char;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((cells) => cells.map((value) => value.trim())).filter((cells) => cells.some(Boolean));
}

const HEADERS: Record<keyof TermInput | 'department', string[]> = {
  term: ['term', 'word', 'термин', 'слово', 'atama', 'so‘z', "so'z"],
  meaning: ['meaning', 'definition', 'english', 'значение', 'определение', 'ma’nosi', "ma'nosi", 'izoh'],
  ru: ['ru', 'russian', 'русский', 'перевод', 'ruscha'],
  uz: ['uz', 'uzbek', 'узбекский', 'o‘zbekcha', "o'zbekcha"],
  example: ['example', 'пример', 'misol'],
  department: ['department', 'отдел', 'департамент', 'bo‘lim', "bo'lim"],
  department_id: [],
};

/** Maps the header row to columns; null when the first row is data (fixed order is used). */
function columnsOf(header: string[]): Record<string, number> | null {
  const found: Record<string, number> = {};
  header.forEach((cell, index) => {
    const name = cell.trim().toLowerCase();
    for (const [field, names] of Object.entries(HEADERS)) if (names.includes(name) && !(field in found)) found[field] = index;
  });
  return 'term' in found && 'meaning' in found ? found : null;
}

export const routes: Route[] = [
  {
    method: 'GET', path: 'orgs/:org/glossary', access: 'org', allowSuspended: true,
    async handle(ctx) {
      const terms = await allTerms(ctx);
      const manage = isHr(ctx);
      // Employees see the company-wide terms and their own department's.
      const visible = manage ? terms : terms.filter((row) => row.department_id === null || row.department_id === ctx.member?.department_id);
      return { terms: visible, can_manage: manage, max_terms: MAX_TERMS };
    },
  },
  {
    method: 'POST', path: 'orgs/:org/glossary', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const departments = await departmentIds(ctx);
      const input = readTerm(obj(body), new Set(departments.keys()));
      const terms = await allTerms(ctx);
      if (terms.some((row) => key(row.term) === key(input.term))) throw new CompanyError('glossary_duplicate', 'This term is already in the glossary.', 409, { field: 'term' });
      if (terms.length >= MAX_TERMS) throw new CompanyError('glossary_full', `The glossary holds up to ${MAX_TERMS} terms.`, 409);
      const row = check<TermRow>(await ctx.db.from('company_glossary_terms').insert({ ...input, org_id: ctx.org!.id, created_by: ctx.user }).select(COLUMNS).single());
      await ctx.audit('glossary.added', row.id, { term: row.term });
      return { term: row };
    },
  },
  {
    method: 'PATCH', path: 'orgs/:org/glossary/:term', access: 'org', roles: HR_ROLES,
    async handle(ctx, params, body) {
      const id = uuid(params.term, 'term');
      const terms = await allTerms(ctx);
      const existing = terms.find((row) => row.id === id);
      if (!existing) throw new CompanyError('glossary_not_found', 'Term not found.', 404);
      const departments = await departmentIds(ctx);
      const input = readTerm({ ...existing, ...obj(body) }, new Set(departments.keys()));
      if (terms.some((row) => row.id !== id && key(row.term) === key(input.term))) throw new CompanyError('glossary_duplicate', 'This term is already in the glossary.', 409, { field: 'term' });
      check(await ctx.db.from('company_glossary_terms').update(input).eq('id', id).eq('org_id', ctx.org!.id));
      await ctx.audit('glossary.updated', id, { term: input.term });
      return { term: { ...existing, ...input } };
    },
  },
  {
    method: 'DELETE', path: 'orgs/:org/glossary/:term', access: 'org', roles: HR_ROLES,
    async handle(ctx, params) {
      const id = uuid(params.term, 'term');
      const existing = check<TermRow | null>(await ctx.db.from('company_glossary_terms').select(COLUMNS).eq('id', id).eq('org_id', ctx.org!.id).maybeSingle());
      if (!existing) throw new CompanyError('glossary_not_found', 'Term not found.', 404);
      check(await ctx.db.from('company_glossary_terms').delete().eq('id', id));
      await ctx.audit('glossary.removed', id, { term: existing.term });
      return { ok: true };
    },
  },
  {
    // CSV columns: term, meaning, ru, uz, example, department (name). A header row is optional.
    method: 'POST', path: 'orgs/:org/glossary/import', access: 'org', roles: HR_ROLES,
    async handle(ctx, _params, body) {
      const input = obj(body);
      const csv = text(input.csv, 'csv', { min: 1, max: 300_000 })!;
      const rows = parseCsv(csv);
      if (!rows.length) throw new CompanyError('invalid_field', 'The file is empty.', 400, { field: 'csv' });
      const columns = columnsOf(rows[0]);
      const data = columns ? rows.slice(1) : rows;
      const firstLine = columns ? 2 : 1;
      if (data.length > MAX_IMPORT_ROWS) throw new CompanyError('glossary_import_too_big', `Import up to ${MAX_IMPORT_ROWS} terms at a time.`, 400, { max: MAX_IMPORT_ROWS });
      const at = columns ?? { term: 0, meaning: 1, ru: 2, uz: 3, example: 4, department: 5 };
      const departments = await departmentIds(ctx);
      const byName = new Map([...departments].map(([id, name]) => [name.trim().toLowerCase(), id]));
      const terms = await allTerms(ctx);
      const existing = new Map(terms.map((row) => [key(row.term), row]));
      let added = 0, updated = 0;
      const skipped: { line: number; reason: string }[] = [];
      for (const [index, cells] of data.entries()) {
        const line = firstLine + index;
        const cell = (field: string) => at[field] === undefined ? '' : cells[at[field]] ?? '';
        const departmentName = cell('department').trim().toLowerCase();
        const departmentId = departmentName ? byName.get(departmentName) : null;
        if (departmentName && !departmentId) { skipped.push({ line, reason: 'department' }); continue; }
        let term: TermInput;
        try {
          term = readTerm({ term: cell('term'), meaning: cell('meaning'), ru: cell('ru'), uz: cell('uz'), example: cell('example'), department_id: departmentId ?? null }, new Set(departments.keys()));
        } catch (cause) {
          skipped.push({ line, reason: cause instanceof CompanyError ? String(cause.details.field ?? 'invalid') : 'invalid' });
          continue;
        }
        const found = existing.get(key(term.term));
        if (found) {
          check(await ctx.db.from('company_glossary_terms').update(term).eq('id', found.id));
          existing.set(key(term.term), { ...found, ...term });
          updated++;
        } else {
          if (existing.size >= MAX_TERMS) { skipped.push({ line, reason: 'full' }); continue; }
          const row = check<TermRow>(await ctx.db.from('company_glossary_terms').insert({ ...term, org_id: ctx.org!.id, created_by: ctx.user }).select(COLUMNS).single());
          existing.set(key(term.term), row);
          added++;
        }
      }
      await ctx.audit('glossary.imported', null, { added, updated, skipped: skipped.length });
      return { added, updated, skipped };
    },
  },
  {
    // A finished practice round. Quiz answers are checked here; flashcards count cards seen.
    method: 'POST', path: 'orgs/:org/glossary/practice', access: 'org',
    async handle(ctx, _params, body) {
      const member = learner(ctx);
      const input = obj(body);
      const mode = oneOf(input.mode, ['cards', 'quiz'] as const, 'mode');
      const minutes = minutesSpent(input.minutes, 30);
      let correct = 0, total = 0;
      if (mode === 'quiz') {
        const answers = Array.isArray(input.answers) ? input.answers.slice(0, 50) : [];
        const ids = new Set((await allTerms(ctx)).map((row) => row.id));
        for (const answer of answers) {
          const { term, choice } = (answer ?? {}) as { term?: unknown; choice?: unknown };
          if (typeof term !== 'string' || !ids.has(term)) continue;
          total++;
          if (choice === term) correct++;
        }
        if (!total) throw new CompanyError('invalid_field', 'Send the quiz answers.', 400, { field: 'answers' });
      } else {
        total = Math.min(200, Math.max(1, Math.round(Number(input.seen) || 1)));
        correct = Math.min(total, Math.max(0, Math.round(Number(input.known) || 0)));
      }
      await logActivity(ctx.db, { org_id: ctx.org!.id, member_id: member.id, user_id: ctx.user, kind: 'glossary', minutes, points: mode === 'quiz' ? correct * 2 : Math.min(40, total), ref: mode });
      return { mode, correct, total };
    },
  },
];

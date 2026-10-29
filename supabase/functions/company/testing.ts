// In-memory stand-in for the supabase-js query builder, enough for route tests:
// select (with one-level embeds), filters, order, limit, single/maybeSingle,
// insert/update/upsert/delete, count, and rpc stubs. Not a SQL engine — the
// migrations themselves are tested against Postgres by scripts/test-company-db.mjs.
import { createCompanyHandler } from './handler.ts';
import type { AiCall, CompanyEnv, Route } from './types.ts';

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;
export interface Relation { table: string; local: string; foreign: string; many?: boolean }

export class FakeDb {
  tables: Record<string, Row[]> = {};
  rpcs: Record<string, (args: Record<string, unknown>) => unknown> = {};
  /** `${table}.${embed}` → how to join, e.g. 'company_members.company_orgs'. */
  relations: Record<string, Relation> = {
    'company_members.company_orgs': { table: 'company_orgs', local: 'org_id', foreign: 'id' },
  };
  constructor(seed: Record<string, Row[]> = {}) {
    for (const [table, rows] of Object.entries(seed)) this.tables[table] = rows.map((row) => ({ ...row }));
  }
  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }
  from(table: string) {
    return new FakeQuery(this, table);
  }
  rpc(name: string, args: Record<string, unknown>) {
    const fn = this.rpcs[name];
    if (!fn) return Promise.resolve({ data: null, error: { code: 'PGRST202', message: `rpc ${name} not stubbed` } });
    try {
      return Promise.resolve({ data: fn(args), error: null });
    } catch (cause) {
      return Promise.resolve({ data: null, error: { code: 'P0001', message: String(cause) } });
    }
  }
}

const compare = (a: unknown, b: unknown): number => a === b ? 0 : a === null || a === undefined ? 1 : b === null || b === undefined ? -1 : typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : 1;

class FakeQuery implements PromiseLike<{ data: unknown; error: { code?: string; message: string } | null; count?: number | null }> {
  private filters: Filter[] = [];
  private orders: { column: string; ascending: boolean }[] = [];
  private max: number | null = null;
  private skip = 0;
  private columns = '*';
  private countMode = false;
  private headOnly = false;
  private mode: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select';
  private payload: Row[] = [];
  private patch: Row = {};
  private conflict: string[] = [];
  private ignoreDuplicates = false;
  private singleMode: 'one' | 'maybe' | null = null;
  private returning = false;
  constructor(private db: FakeDb, private table: string) {}

  select(columns = '*', options: { count?: string; head?: boolean } = {}) {
    this.columns = columns;
    if (this.mode !== 'select') this.returning = true;
    this.countMode = Boolean(options.count);
    this.headOnly = Boolean(options.head);
    return this;
  }
  insert(rows: Row | Row[]) { this.mode = 'insert'; this.payload = (Array.isArray(rows) ? rows : [rows]).map((row) => ({ ...row })); return this; }
  upsert(rows: Row | Row[], options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.mode = 'upsert';
    this.payload = (Array.isArray(rows) ? rows : [rows]).map((row) => ({ ...row }));
    this.conflict = (options.onConflict ?? 'id').split(',').map((column) => column.trim());
    this.ignoreDuplicates = Boolean(options.ignoreDuplicates);
    return this;
  }
  update(patch: Row) { this.mode = 'update'; this.patch = { ...patch }; return this; }
  delete() { this.mode = 'delete'; return this; }

  eq(column: string, value: unknown) { this.filters.push((row) => row[column] === value); return this; }
  neq(column: string, value: unknown) { this.filters.push((row) => row[column] !== value); return this; }
  in(column: string, values: unknown[]) { this.filters.push((row) => values.includes(row[column])); return this; }
  gt(column: string, value: unknown) { this.filters.push((row) => row[column] !== null && row[column] !== undefined && compare(row[column], value) > 0); return this; }
  gte(column: string, value: unknown) { this.filters.push((row) => row[column] !== null && row[column] !== undefined && compare(row[column], value) >= 0); return this; }
  lt(column: string, value: unknown) { this.filters.push((row) => row[column] !== null && row[column] !== undefined && compare(row[column], value) < 0); return this; }
  lte(column: string, value: unknown) { this.filters.push((row) => row[column] !== null && row[column] !== undefined && compare(row[column], value) <= 0); return this; }
  is(column: string, value: null | boolean) { this.filters.push((row) => (row[column] ?? null) === value); return this; }
  not(column: string, operator: string, value: unknown) {
    if (operator === 'is') this.filters.push((row) => (row[column] ?? null) !== value);
    else if (operator === 'eq') this.filters.push((row) => row[column] !== value);
    else throw new Error(`FakeDb: not.${operator} unsupported`);
    return this;
  }
  ilike(column: string, pattern: string) {
    const regex = new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replaceAll('%', '.*').replaceAll('_', '.')}$`, 'i');
    this.filters.push((row) => regex.test(String(row[column] ?? '')));
    return this;
  }
  contains(column: string, values: unknown[]) { this.filters.push((row) => Array.isArray(row[column]) && values.every((value) => (row[column] as unknown[]).includes(value))); return this; }
  order(column: string, options: { ascending?: boolean } = {}) { this.orders.push({ column, ascending: options.ascending !== false }); return this; }
  limit(count: number) { this.max = count; return this; }
  range(from: number, to: number) { this.skip = from; this.max = to - from + 1; return this; }
  maybeSingle() { this.singleMode = 'maybe'; return this; }
  single() { this.singleMode = 'one'; return this; }

  private project(row: Row): Row {
    if (this.columns === '*') return { ...row };
    const out: Row = {};
    for (const part of this.columns.split(/,(?![^(]*\))/).map((value) => value.trim()).filter(Boolean)) {
      const embed = part.match(/^(\w+)(?:!\w+)?\((.*)\)$/);
      if (embed) {
        const relation = this.db.relations[`${this.table}.${embed[1]}`];
        if (!relation) throw new Error(`FakeDb: no relation ${this.table}.${embed[1]}`);
        const related = this.db.rows(relation.table).filter((other) => other[relation.foreign] === row[relation.local]);
        const pick = (other: Row) => embed[2] === '*' ? { ...other } : Object.fromEntries(embed[2].split(',').map((column) => column.trim()).map((column) => [column, other[column] ?? null]));
        out[embed[1]] = relation.many ? related.map(pick) : related[0] ? pick(related[0]) : null;
      } else out[part] = row[part] ?? null;
    }
    return out;
  }

  private run(): { data: unknown; error: { code?: string; message: string } | null; count?: number | null } {
    const rows = this.db.rows(this.table);
    const now = new Date().toISOString();
    let affected: Row[];
    if (this.mode === 'insert' || this.mode === 'upsert') {
      affected = [];
      for (const input of this.payload) {
        const existing = this.mode === 'upsert' ? rows.find((row) => this.conflict.every((column) => row[column] === input[column])) : undefined;
        if (existing) {
          if (!this.ignoreDuplicates) Object.assign(existing, input, { updated_at: now });
          affected.push(existing);
        } else {
          const row = { id: crypto.randomUUID(), created_at: now, updated_at: now, ...input };
          rows.push(row);
          affected.push(row);
        }
      }
      if (!this.returning) return { data: null, error: null };
    } else {
      affected = rows.filter((row) => this.filters.every((filter) => filter(row)));
      if (this.mode === 'update') {
        for (const row of affected) Object.assign(row, this.patch, { updated_at: now });
        if (!this.returning) return { data: null, error: null };
      } else if (this.mode === 'delete') {
        this.db.tables[this.table] = rows.filter((row) => !affected.includes(row));
        if (!this.returning) return { data: null, error: null };
      }
    }
    let result = [...affected];
    for (const { column, ascending } of [...this.orders].reverse()) result.sort((a, b) => (ascending ? 1 : -1) * compare(a[column], b[column]));
    const count = result.length;
    result = result.slice(this.skip, this.max === null ? undefined : this.skip + this.max);
    if (this.headOnly) return { data: null, error: null, count };
    const data = result.map((row) => this.project(row));
    if (this.singleMode) {
      if (data.length > 1) return { data: null, error: { code: 'PGRST116', message: 'more than one row' } };
      if (!data.length) return this.singleMode === 'maybe' ? { data: null, error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
      return { data: data[0], error: null, count: this.countMode ? count : null };
    }
    return { data, error: null, count: this.countMode ? count : null };
  }

  then<A = { data: unknown; error: { code?: string; message: string } | null; count?: number | null }, B = never>(
    onfulfilled?: ((value: { data: unknown; error: { code?: string; message: string } | null; count?: number | null }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected);
  }
}

export const TEST_ENV: CompanyEnv = { pilotTests: 10, selfServe: true, aiDailyLimit: 50, appUrl: 'https://company.schood.online' };
export const noAi: AiCall = <T>(_request: unknown, fallback: T) => Promise.resolve({ data: fallback, status: 'unconfigured' as const });

/** A handler over a FakeDb whose bearer token is the user id itself ("Bearer <uuid>"). */
export function testHandler(db: FakeDb, routes: Route[], options: { ai?: AiCall; env?: Partial<CompanyEnv>; now?: () => Date } = {}) {
  const handler = createCompanyHandler({
    db, routes, origins: ['https://company.schood.online'], env: { ...TEST_ENV, ...options.env }, ai: options.ai ?? noAi, now: options.now,
    userFromToken: (token) => Promise.resolve(db.rows('users').some((row) => row.id === token) ? { id: token, email: `${token.slice(0, 8)}@example.com` } : null),
  });
  return async (method: string, path: string, { user, body }: { user?: string; body?: unknown } = {}) => {
    const response = await handler(new Request(`https://x.supabase.co/functions/v1/company/${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(user ? { Authorization: `Bearer ${user}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));
    return { status: response.status, body: await response.json() };
  };
}

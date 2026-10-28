// In-memory stand-in for `@supabase/supabase-js` used by handler-level tests.
// Tests run with `--import-map supabase/functions/_testing/import-map.json`,
// which maps the esm.sh client to this file and the std `serve` helper to
// serve-capture.ts, so an Edge Function's real handler can be exercised
// without a network or a database. Only the query-builder subset the scorers
// use is implemented; unknown operations throw so tests fail loudly.

type Row = Record<string, unknown>;
export type FakeDb = {
  tables: Record<string, Row[]>;
  /** access token -> user id */
  users: Record<string, string>;
  writes: Array<{ table: string; op: string; rows: Row[] }>;
  rpc?: (name: string, args: Row) => unknown;
};

const g = globalThis as unknown as { __fakeDb?: FakeDb };
export const installFakeDb = (db: Omit<FakeDb, "writes"> & { writes?: FakeDb["writes"] }): FakeDb => {
  const full: FakeDb = { writes: [], ...db };
  g.__fakeDb = full;
  return full;
};
const db = (): FakeDb => {
  if (!g.__fakeDb) throw new Error("fake supabase: call installFakeDb() first");
  return g.__fakeDb;
};

const readPath = (row: Row, column: string): unknown => {
  const m = column.match(/^([a-z_]+)->>?(.+)$/);
  if (!m) return row[column];
  let value: unknown = row[m[1]];
  for (const part of m[2].split(/->>?/)) {
    value = value && typeof value === "object" ? (value as Row)[part.replace(/'/g, "")] : undefined;
  }
  return column.includes("->>") && value != null && typeof value !== "string" ? String(value) : value;
};

const same = (a: unknown, b: unknown): boolean => String(a) === String(b);
const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

type Filter = (row: Row) => boolean;

class Query implements PromiseLike<{ data: unknown; error: null; count?: number | null }> {
  private filters: Filter[] = [];
  private orders: Array<{ column: string; ascending: boolean }> = [];
  private limitN: number | null = null;
  private mode: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  private payload: Row[] = [];
  private conflict: string[] = [];
  private singleMode: "maybe" | "one" | null = null;
  private returning = false;
  private head = false;
  private countMode = false;

  constructor(private table: string) {}

  select(_columns?: string, opts?: { count?: string; head?: boolean }) {
    if (this.mode !== "select") this.returning = true;
    if (opts?.head) this.head = true;
    if (opts?.count) this.countMode = true;
    return this;
  }
  eq(column: string, value: unknown) { this.filters.push((r) => same(readPath(r, column), value)); return this; }
  neq(column: string, value: unknown) { this.filters.push((r) => !same(readPath(r, column), value)); return this; }
  in(column: string, values: unknown[]) { this.filters.push((r) => values.some((v) => same(readPath(r, column), v))); return this; }
  gte(column: string, value: unknown) { this.filters.push((r) => String(readPath(r, column) ?? "") >= String(value)); return this; }
  lte(column: string, value: unknown) { this.filters.push((r) => String(readPath(r, column) ?? "") <= String(value)); return this; }
  is(column: string, value: unknown) { this.filters.push((r) => (readPath(r, column) ?? null) === value); return this; }
  filter(column: string, op: string, value: unknown) {
    if (op !== "eq") throw new Error(`fake supabase: filter op ${op}`);
    return this.eq(column, value);
  }
  not(column: string, op: string, value: unknown) {
    if (op === "eq") { this.filters.push((r) => !same(readPath(r, column), value)); return this; }
    if (op === "is") { this.filters.push((r) => (readPath(r, column) ?? null) !== value); return this; }
    throw new Error(`fake supabase: not op ${op}`);
  }
  order(column: string, opts?: { ascending?: boolean }) { this.orders.push({ column, ascending: opts?.ascending !== false }); return this; }
  limit(n: number) { this.limitN = n; return this; }
  maybeSingle() { this.singleMode = "maybe"; return this; }
  single() { this.singleMode = "one"; return this; }
  insert(rows: Row | Row[]) { this.mode = "insert"; this.payload = Array.isArray(rows) ? rows : [rows]; return this; }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
    this.mode = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.conflict = String(opts?.onConflict ?? "id").split(",").map((c) => c.trim());
    return this;
  }
  update(patch: Row) { this.mode = "update"; this.payload = [patch]; return this; }
  delete() { this.mode = "delete"; return this; }

  private run(): { data: unknown; error: null; count?: number | null } {
    const store = db();
    const table = (store.tables[this.table] ??= []);
    const matches = () => table.filter((r) => this.filters.every((f) => f(r)));
    let rows: Row[];
    if (this.mode === "select") {
      rows = matches();
    } else if (this.mode === "insert") {
      rows = this.payload.map((r) => ({ id: crypto.randomUUID(), ...clone(r) }));
      table.push(...rows);
      store.writes.push({ table: this.table, op: "insert", rows: clone(rows) });
    } else if (this.mode === "upsert") {
      rows = this.payload.map((incoming) => {
        const existing = table.find((r) => this.conflict.every((c) => same(r[c], incoming[c])));
        if (existing) { Object.assign(existing, clone(incoming)); return existing; }
        const created = { id: crypto.randomUUID(), ...clone(incoming) };
        table.push(created);
        return created;
      });
      store.writes.push({ table: this.table, op: "upsert", rows: clone(rows) });
    } else if (this.mode === "update") {
      rows = matches();
      for (const r of rows) Object.assign(r, clone(this.payload[0]));
      store.writes.push({ table: this.table, op: "update", rows: clone(rows) });
    } else {
      rows = matches();
      store.tables[this.table] = table.filter((r) => !rows.includes(r));
      store.writes.push({ table: this.table, op: "delete", rows: clone(rows) });
    }
    if (this.mode !== "select" && !this.returning) return { data: null, error: null };
    for (const o of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => {
        const x = readPath(a, o.column) as number | string;
        const y = readPath(b, o.column) as number | string;
        const cmp = x === y ? 0 : x == null ? 1 : y == null ? -1 : x < y ? -1 : 1;
        return o.ascending ? cmp : -cmp;
      });
    }
    if (this.limitN != null) rows = rows.slice(0, this.limitN);
    if (this.countMode && this.head) return { data: null, error: null, count: rows.length };
    const data = clone(rows);
    if (this.singleMode) return { data: data[0] ?? null, error: null };
    return { data, error: null, ...(this.countMode ? { count: rows.length } : {}) };
  }

  then<A = { data: unknown; error: null }, B = never>(
    onfulfilled?: ((value: { data: unknown; error: null; count?: number | null }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    try {
      return Promise.resolve(this.run()).then(onfulfilled, onrejected);
    } catch (error) {
      return Promise.reject(error).then(onfulfilled, onrejected);
    }
  }
}

export const createClient = (_url: string, _key: string, _opts?: unknown) => ({
  from: (table: string) => new Query(table),
  rpc: (name: string, args: Row) => Promise.resolve({ data: db().rpc ? db().rpc!(name, args) : null, error: null }),
  auth: {
    getUser: (token: string) => {
      const id = db().users[token];
      return Promise.resolve(
        id
          ? { data: { user: { id, email: `${id}@test.local` } }, error: null }
          : { data: { user: null }, error: { message: "invalid token", status: 401 } },
      );
    },
  },
  storage: {
    from: (bucket: string) => ({
      createSignedUrl: (path: string) => Promise.resolve({ data: { signedUrl: `https://signed.test/${bucket}/${path}` }, error: null }),
    }),
  },
});

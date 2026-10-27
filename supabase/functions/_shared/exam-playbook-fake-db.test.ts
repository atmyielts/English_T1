// In-memory stand-in for the supabase-js query builder, covering exactly the
// calls the exam-playbook handlers make. No network, no real database.

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export type FakeCall = { table: string; op: string; payload?: unknown };

export class FakeDb {
  tables: Record<string, Row[]> = {};
  calls: FakeCall[] = [];
  /** Make a table/op fail, e.g. `fail = (t, op) => t === "x" && op === "select"`. */
  fail: ((table: string, op: string) => boolean) | null = null;
  throwOn: ((table: string, op: string) => boolean) | null = null;

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [table, rows] of Object.entries(seed)) this.tables[table] = rows.map((r) => ({ ...r }));
  }

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  from(table: string) {
    return new FakeQuery(this, table);
  }

  count(table: string, op: string) {
    return this.calls.filter((c) => c.table === table && c.op === op).length;
  }
}

const same = (a: unknown, b: unknown) => (a == null && b == null) || String(a) === String(b);

class FakeQuery implements PromiseLike<{ data: unknown; error: unknown; count?: number | null }> {
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private filters: Filter[] = [];
  private payload: unknown = null;
  private conflict: string[] = [];
  private sort: Array<{ key: string; asc: boolean }> = [];
  private max: number | null = null;
  private mode: "many" | "single" | "maybe" = "many";
  private head = false;
  private wantCount = false;
  private returning = false;

  constructor(private db: FakeDb, private table: string) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    if (this.op !== "select") this.returning = true;
    if (options?.head) this.head = true;
    if (options?.count) this.wantCount = true;
    return this;
  }
  insert(rows: unknown) { this.op = "insert"; this.payload = rows; return this; }
  update(patch: unknown) { this.op = "update"; this.payload = patch; return this; }
  upsert(row: unknown, options?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = row;
    this.conflict = (options?.onConflict ?? "id").split(",").map((s) => s.trim());
    return this;
  }
  delete() { this.op = "delete"; return this; }
  eq(key: string, value: unknown) { this.filters.push((r) => same(r[key], value)); return this; }
  neq(key: string, value: unknown) { this.filters.push((r) => !same(r[key], value)); return this; }
  in(key: string, values: unknown[]) { this.filters.push((r) => values.some((v) => same(r[key], v))); return this; }
  is(key: string, value: unknown) { this.filters.push((r) => (value === null ? r[key] == null : r[key] === value)); return this; }
  gte(key: string, value: unknown) { this.filters.push((r) => String(r[key] ?? "") >= String(value)); return this; }
  lte(key: string, value: unknown) { this.filters.push((r) => String(r[key] ?? "") <= String(value)); return this; }
  order(key: string, options?: { ascending?: boolean }) { this.sort.push({ key, asc: options?.ascending !== false }); return this; }
  limit(n: number) { this.max = n; return this; }
  maybeSingle() { this.mode = "maybe"; return this; }
  single() { this.mode = "single"; return this; }

  private matches(row: Row) {
    return this.filters.every((f) => f(row));
  }

  private shape(data: Row[]) {
    if (this.mode === "many") return { data, error: null };
    if (this.mode === "single" && data.length !== 1) return { data: null, error: { message: "single row expected", code: "PGRST116" } };
    return { data: data[0] ?? null, error: null };
  }

  private run() {
    this.db.calls.push({ table: this.table, op: this.op, payload: this.payload });
    if (this.db.throwOn?.(this.table, this.op)) throw new Error(`private database detail for ${this.table}`);
    if (this.db.fail?.(this.table, this.op)) return { data: null, error: { message: `private failure in ${this.table}` }, count: null };
    const rows = this.db.rows(this.table);
    const now = new Date().toISOString();
    const stamp = (row: Row): Row => ({
      id: row.id ?? crypto.randomUUID(),
      created_at: row.created_at ?? now,
      occurred_at: this.table.endsWith("_events") ? row.occurred_at ?? now : row.occurred_at,
      ...row,
    });

    if (this.op === "select") {
      let out = rows.filter((r) => this.matches(r));
      for (const s of [...this.sort].reverse()) {
        out = [...out].sort((a, b) => {
          const av = a[s.key], bv = b[s.key];
          const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av ?? "").localeCompare(String(bv ?? ""));
          return s.asc ? cmp : -cmp;
        });
      }
      const count = out.length;
      if (this.max != null) out = out.slice(0, this.max);
      if (this.head) return { data: null, error: null, count };
      return { ...this.shape(out.map((r) => ({ ...r }))), count: this.wantCount ? count : null };
    }
    if (this.op === "insert") {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload]) as Row[];
      const inserted = list.map(stamp);
      rows.push(...inserted);
      return this.returning ? this.shape(inserted.map((r) => ({ ...r }))) : { data: null, error: null };
    }
    if (this.op === "update") {
      const hit = rows.filter((r) => this.matches(r));
      for (const r of hit) Object.assign(r, this.payload as Row);
      return this.returning ? this.shape(hit.map((r) => ({ ...r }))) : { data: null, error: null };
    }
    if (this.op === "upsert") {
      const row = this.payload as Row;
      const existing = rows.find((r) => this.conflict.every((k) => same(r[k], row[k])));
      let result: Row;
      if (existing) {
        Object.assign(existing, row);
        result = existing;
      } else {
        result = stamp(row);
        rows.push(result);
      }
      return this.returning ? this.shape([{ ...result }]) : { data: null, error: null };
    }
    // delete
    const keep = rows.filter((r) => !this.matches(r));
    this.db.tables[this.table] = keep;
    return { data: null, error: null };
  }

  then<A = { data: unknown; error: unknown }, B = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown; count?: number | null }) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    try {
      return Promise.resolve(this.run()).then(onfulfilled, onrejected);
    } catch (error) {
      return Promise.reject(error).then(onfulfilled, onrejected);
    }
  }
}

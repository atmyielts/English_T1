// In-memory stand-in for the parts of supabase-js that academy-learning uses.
// Filters: eq, neq, in, is, not(is null), gt, lt. Mutations: insert, update,
// upsert (onConflict + ignoreDuplicates). RPCs are supplied per test.

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;
type RpcHandler = (args: Row, db: FakeDb) => { data?: unknown; error?: { code?: string; message?: string } | null };

export class FakeDb {
  tables: Record<string, Row[]> = {};
  rpcCalls: Array<{ name: string; args: Row }> = [];
  constructor(seed: Record<string, Row[]> = {}, public rpcs: Record<string, RpcHandler> = {}) {
    for (const [name, rows] of Object.entries(seed)) this.tables[name] = rows.map((r) => ({ ...r }));
  }
  table(name: string): Row[] {
    return (this.tables[name] ??= []);
  }
  from(name: string) {
    return new Query(this, name);
  }
  rpc(name: string, args: Row) {
    this.rpcCalls.push({ name, args });
    const handler = this.rpcs[name];
    if (!handler) return Promise.resolve({ data: null, error: { code: "PGRST202", message: `missing rpc ${name}` } });
    const result = handler(args, this);
    return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
  }
}

class Query {
  private filters: Filter[] = [];
  private mode: "select" | "insert" | "update" | "upsert" = "select";
  private payload: Row | Row[] | null = null;
  private upsertOptions: { onConflict?: string; ignoreDuplicates?: boolean } = {};
  private limitValue: number | null = null;
  private orderBy: Array<{ key: string; ascending: boolean }> = [];
  private single = false;
  private countOnly = false;
  private returning = false;
  constructor(private db: FakeDb, private name: string) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }) {
    if (this.mode === "select") this.countOnly = Boolean(options?.head);
    else this.returning = true;
    return this;
  }
  insert(payload: Row | Row[]) { this.mode = "insert"; this.payload = payload; return this; }
  update(payload: Row) { this.mode = "update"; this.payload = payload; return this; }
  upsert(payload: Row | Row[], options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.mode = "upsert"; this.payload = payload; this.upsertOptions = options; return this;
  }
  eq(key: string, value: unknown) { this.filters.push((r) => r[key] === value); return this; }
  neq(key: string, value: unknown) { this.filters.push((r) => r[key] !== value); return this; }
  in(key: string, values: unknown[]) { this.filters.push((r) => values.includes(r[key])); return this; }
  is(key: string, value: null) { this.filters.push((r) => (r[key] ?? null) === value); return this; }
  not(key: string, _op: string, _value: null) { this.filters.push((r) => r[key] != null); return this; }
  gt(key: string, value: string) { this.filters.push((r) => String(r[key] ?? "") > value); return this; }
  lt(key: string, value: string) { this.filters.push((r) => String(r[key] ?? "") < value); return this; }
  or(_expr: string) { return this; }
  order(key: string, options: { ascending?: boolean } = {}) { this.orderBy.push({ key, ascending: options.ascending !== false }); return this; }
  limit(n: number) { this.limitValue = n; return this; }
  maybeSingle() { this.single = true; return this.run(); }
  then<T>(resolve: (value: { data: unknown; error: null; count?: number }) => T, reject?: (e: unknown) => T) {
    return this.run().then(resolve, reject);
  }

  private matches(row: Row) { return this.filters.every((f) => f(row)); }

  private run(): Promise<{ data: unknown; error: null; count?: number }> {
    const rows = this.db.table(this.name);
    if (this.mode === "insert") {
      const list = (Array.isArray(this.payload) ? this.payload : [this.payload!]).map((r) => ({ id: crypto.randomUUID(), ...r }));
      rows.push(...list);
      return Promise.resolve({ data: this.single ? list[0] : list, error: null });
    }
    if (this.mode === "upsert") {
      const keys = (this.upsertOptions.onConflict ?? "id").split(",").map((k) => k.trim());
      const out: Row[] = [];
      for (const r of Array.isArray(this.payload) ? this.payload : [this.payload!]) {
        const existing = rows.find((row) => keys.every((k) => row[k] === r[k]));
        if (existing) {
          if (!this.upsertOptions.ignoreDuplicates) Object.assign(existing, r);
          out.push(existing);
        } else {
          const created = { id: crypto.randomUUID(), ...r };
          rows.push(created);
          out.push(created);
        }
      }
      return Promise.resolve({ data: this.single ? out[0] ?? null : out, error: null });
    }
    if (this.mode === "update") {
      const hit = rows.filter((r) => this.matches(r));
      for (const r of hit) Object.assign(r, this.payload);
      return Promise.resolve({ data: this.single ? hit[0] ?? null : hit, error: null });
    }
    let hit = rows.filter((r) => this.matches(r));
    for (const { key, ascending } of [...this.orderBy].reverse()) {
      hit = [...hit].sort((a, b) => String(a[key] ?? "").localeCompare(String(b[key] ?? "")) * (ascending ? 1 : -1));
    }
    if (this.limitValue != null) hit = hit.slice(0, this.limitValue);
    if (this.countOnly) return Promise.resolve({ data: null, error: null, count: hit.length });
    return Promise.resolve({ data: this.single ? hit[0] ?? null : hit, error: null });
  }
}

export class FakeTelegram {
  calls: Array<{ method: string; body: Row }> = [];
  files: Record<string, Uint8Array<ArrayBuffer>> = {};
  call = (method: string, body: Row) => {
    this.calls.push({ method, body });
    return Promise.resolve({ ok: true, result: { message_id: this.calls.length } } as Row);
  };
  download = (fileId: string, _limit: number) => {
    const bytes = this.files[fileId];
    if (!bytes) return Promise.reject(new Error("missing file"));
    return Promise.resolve({ bytes, filePath: `photos/${fileId}.jpg` });
  };
  messages() {
    return this.calls.filter((c) => c.method === "sendMessage").map((c) => String(c.body.text));
  }
}

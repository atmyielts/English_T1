import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAdminRequest } from "../_shared/admin-access.ts";

type ProductRow = {
  id: string;
  name: string;
  type: string;
  status: string;
};

type ExperienceRow = {
  id: string;
  product_id: string;
};

type SessionRow = {
  user_id: string | null;
  experience_id: string | null;
  status: string | null;
  created_at: string;
};

type PaymentRow = {
  product_id: string | null;
  amount: number | null;
  status: string | null;
  grant_error: string | null;
  created_at: string;
};

type UserRow = {
  created_at: string;
};

type EntitlementRow = {
  resource_id: string | null;
};

type GuardrailEventRow = {
  event_type: string;
  table_name: string | null;
  row_id: string | null;
  actor_user_id: string | null;
  created_at: string;
  details: Record<string, unknown> | null;
};
type AdminAuditRow = {
  user_id: string | null;
  user_email: string | null;
  permission_key: string | null;
  action: string;
  method: string;
  path: string;
  status_code: number;
  ip: string | null;
  request_id: string | null;
  created_at: string;
};

type DailyPoint = { day: string; count: number };
type DailyRevenuePoint = { day: string; count: number; revenue: number };

type ProductUsage = {
  product_id: string;
  name: string;
  type: string;
  status: string;
  sessions_30d: number;
  users_30d: number;
  active_entitlements: number;
  paid_payments_30d: number;
  revenue_30d: number;
};

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const PAGE_SIZE = 1000;
const MAX_ROWS_PER_DATASET = 50_000;

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const normalizeStatus = (value: unknown): string => String(value ?? "").trim().toLowerCase();

const parseSuccessStatuses = (raw: string | undefined): Set<string> => {
  const list = (raw ?? "paid,success,completed")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  return new Set(list);
};

const toDayKey = (iso: string): string => {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

const getRecentDayKeys = (days: number): string[] => {
  const out: string[] = [];
  const base = new Date();
  base.setUTCHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() - i);
    out.push(toDayKey(d.toISOString()));
  }
  return out;
};

const isoHoursAgo = (hours: number): string => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
const isoDaysAgo = (days: number): string => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const countRows = async (query: any): Promise<number> => {
  const { count, error } = await query;
  if (error) throw error;
  return Number(count ?? 0);
};

const fetchPagedRows = async <T>(fetchPage: (from: number, to: number) => Promise<T[]>, label: string): Promise<{
  rows: T[];
  truncated: boolean;
}> => {
  const rows: T[] = [];
  let from = 0;
  let truncated = false;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const page = await fetchPage(from, to);
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    if (rows.length >= MAX_ROWS_PER_DATASET) {
      truncated = true;
      console.warn(`[admin-analytics] Truncated dataset "${label}" at ${rows.length} rows`);
      break;
    }
    from += PAGE_SIZE;
  }

  return { rows, truncated };
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  try {
    const sb = createClient(getEnv("SUPABASE_URL"), getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false },
    });
    const authz = await authorizeAdminRequest(sb, req, corsHeaders, {
      requiredPermission: "admin.analytics.view",
      action: "admin.analytics",
    });
    if (!authz.ok) return authz.response;

    const nowIso = new Date().toISOString();
    const since24h = isoHoursAgo(24);
    const since7d = isoDaysAgo(7);
    const since30d = isoDaysAgo(30);
    const since5m = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const since30m = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const since2h = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const successStatuses = parseSuccessStatuses(Deno.env.get("TSPAY_SUCCESS_STATUSES"));

    const [
      usersTotal,
      usersNew7d,
      usersNew30d,
      sessionsTotal,
      sessions7d,
      sessions30d,
      sessionsCompleted30d,
      paymentsTotal,
      productsActive,
      plansActive,
      paidUngranted5m,
      paidUngranted30m,
      paidUngranted2h,
      paidUngranted24h,
      paymentsWithGrantError,
    ] = await Promise.all([
      countRows(sb.from("users").select("id", { count: "exact", head: true })),
      countRows(sb.from("users").select("id", { count: "exact", head: true }).gte("created_at", since7d)),
      countRows(sb.from("users").select("id", { count: "exact", head: true }).gte("created_at", since30d)),
      countRows(sb.from("sessions").select("id", { count: "exact", head: true })),
      countRows(sb.from("sessions").select("id", { count: "exact", head: true }).gte("created_at", since7d)),
      countRows(sb.from("sessions").select("id", { count: "exact", head: true }).gte("created_at", since30d)),
      countRows(
        sb.from("sessions").select("id", { count: "exact", head: true }).gte("created_at", since30d).eq("status", "completed"),
      ),
      countRows(sb.from("payments").select("id", { count: "exact", head: true })),
      countRows(sb.from("products").select("id", { count: "exact", head: true }).eq("status", "active")),
      countRows(sb.from("plans").select("id", { count: "exact", head: true }).eq("is_active", true)),
      countRows(
        sb
          .from("payments")
          .select("id", { count: "exact", head: true })
          .is("granted_at", null)
          .lt("created_at", since5m)
          .in("status", ["paid", "success", "completed"]),
      ),
      countRows(
        sb
          .from("payments")
          .select("id", { count: "exact", head: true })
          .is("granted_at", null)
          .lt("created_at", since30m)
          .in("status", ["paid", "success", "completed"]),
      ),
      countRows(
        sb
          .from("payments")
          .select("id", { count: "exact", head: true })
          .is("granted_at", null)
          .lt("created_at", since2h)
          .in("status", ["paid", "success", "completed"]),
      ),
      countRows(
        sb
          .from("payments")
          .select("id", { count: "exact", head: true })
          .is("granted_at", null)
          .lt("created_at", since24h)
          .in("status", ["paid", "success", "completed"]),
      ),
      countRows(sb.from("payments").select("id", { count: "exact", head: true }).not("grant_error", "is", null)),
    ]);

    let hardDeleteBlocks24h = 0;
    let hardDeleteBlocks7d = 0;
    let recentHardDeleteBlocks: GuardrailEventRow[] = [];
    const reliabilityUnavailableSources: string[] = [];
    try {
      const [
        guardrail24h,
        guardrail7d,
        { data: hardDeleteData, error: hardDeleteErr },
      ] = await Promise.all([
        countRows(
          sb
            .from("guardrail_events")
            .select("id", { count: "exact", head: true })
            .eq("event_type", "hard_delete_blocked")
            .gte("created_at", since24h),
        ),
        countRows(
          sb
            .from("guardrail_events")
            .select("id", { count: "exact", head: true })
            .eq("event_type", "hard_delete_blocked")
            .gte("created_at", since7d),
        ),
        sb
          .from("guardrail_events")
          .select("event_type,table_name,row_id,actor_user_id,created_at,details")
          .eq("event_type", "hard_delete_blocked")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);
      if (hardDeleteErr) throw hardDeleteErr;
      hardDeleteBlocks24h = guardrail24h;
      hardDeleteBlocks7d = guardrail7d;
      recentHardDeleteBlocks = (hardDeleteData ?? []) as GuardrailEventRow[];
    } catch (_err) {
      reliabilityUnavailableSources.push("guardrail_events");
    }

    const [{ data: productsData, error: productsErr }, { data: experiencesData, error: experiencesErr }] = await Promise.all([
      sb.from("products").select("id,name,type,status").order("name", { ascending: true }),
      sb.from("experiences").select("id,product_id"),
    ]);
    if (productsErr) throw productsErr;
    if (experiencesErr) throw experiencesErr;

    const products = (productsData ?? []) as ProductRow[];
    const experiences = (experiencesData ?? []) as ExperienceRow[];
    const experienceToProduct = new Map<string, string>();
    for (const e of experiences) experienceToProduct.set(String(e.id), String(e.product_id));

    const [sessions30Load, payments30Load, users30Load, entitlementsLoad] = await Promise.all([
      fetchPagedRows<SessionRow>(async (from, to) => {
        const { data, error } = await sb
          .from("sessions")
          .select("user_id,experience_id,status,created_at")
          .gte("created_at", since30d)
          .order("created_at", { ascending: true })
          .range(from, to);
        if (error) throw error;
        return (data ?? []) as SessionRow[];
      }, "sessions_30d"),
      fetchPagedRows<PaymentRow>(async (from, to) => {
        const { data, error } = await sb
          .from("payments")
          .select("product_id,amount,status,grant_error,created_at")
          .gte("created_at", since30d)
          .order("created_at", { ascending: true })
          .range(from, to);
        if (error) throw error;
        return (data ?? []) as PaymentRow[];
      }, "payments_30d"),
      fetchPagedRows<UserRow>(async (from, to) => {
        const { data, error } = await sb
          .from("users")
          .select("created_at")
          .gte("created_at", since30d)
          .order("created_at", { ascending: true })
          .range(from, to);
        if (error) throw error;
        return (data ?? []) as UserRow[];
      }, "users_30d"),
      fetchPagedRows<EntitlementRow>(async (from, to) => {
        const { data, error } = await sb
          .from("entitlements")
          .select("resource_id")
          .eq("resource_type", "product")
          .eq("is_active", true)
          .or(`ends_at.is.null,ends_at.gt.${nowIso}`)
          .order("created_at", { ascending: true })
          .range(from, to);
        if (error) throw error;
        return (data ?? []) as EntitlementRow[];
      }, "entitlements_active"),
    ]);
    const days30 = getRecentDayKeys(30);
    const since24Ms = Date.parse(since24h);
    const since7Ms = Date.parse(since7d);

    const canViewAdminActivity =
      authz.context.permissions.includes("admin.*") || authz.context.permissions.includes("admin.activity.view");
    let adminActivity: {
      available: boolean;
      requests_24h: number;
      failed_requests_24h: number;
      unique_admins_24h: number;
      top_actions_24h: Array<{ action: string; count: number }>;
      top_admins_24h: Array<{ user_id: string | null; user_email: string | null; count: number }>;
      status_buckets_24h: Array<{ bucket: string; count: number }>;
      daily_requests_30d: DailyPoint[];
      recent_events: Array<{
        created_at: string;
        user_id: string | null;
        user_email: string | null;
        action: string;
        method: string;
        path: string;
        status_code: number;
        permission_key: string | null;
        ip: string | null;
        request_id: string | null;
      }>;
    } = {
      available: canViewAdminActivity,
      requests_24h: 0,
      failed_requests_24h: 0,
      unique_admins_24h: 0,
      top_actions_24h: [],
      top_admins_24h: [],
      status_buckets_24h: [],
      daily_requests_30d: days30.map((day) => ({ day, count: 0 })),
      recent_events: [],
    };
    let adminAuditTruncated = false;
    if (canViewAdminActivity) {
      try {
        const auditLoad = await fetchPagedRows<AdminAuditRow>(async (from, to) => {
          const { data, error } = await sb
            .from("admin_audit_logs")
            .select("user_id,user_email,permission_key,action,method,path,status_code,ip,request_id,created_at")
            .gte("created_at", since30d)
            .order("created_at", { ascending: true })
            .range(from, to);
          if (error) throw error;
          return (data ?? []) as AdminAuditRow[];
        }, "admin_audit_logs_30d");

        const dailyMap = new Map<string, number>(days30.map((day) => [day, 0]));
        const actionCounts24h = new Map<string, number>();
        const adminCounts24h = new Map<string, { user_id: string | null; user_email: string | null; count: number }>();
        const statusBuckets24h = new Map<string, number>();
        const admins24h = new Set<string>();
        const recent = [...auditLoad.rows].reverse().slice(0, 30);
        let requests24h = 0;
        let failed24h = 0;
        for (const row of auditLoad.rows) {
          const day = toDayKey(row.created_at);
          dailyMap.set(day, (dailyMap.get(day) ?? 0) + 1);

          const createdAtMs = Date.parse(row.created_at);
          if (!Number.isFinite(createdAtMs) || createdAtMs < since24Ms) continue;

          requests24h += 1;
          if (row.status_code >= 400) failed24h += 1;
          if (row.user_id) admins24h.add(row.user_id);

          const action = String(row.action ?? "").trim() || "unknown";
          actionCounts24h.set(action, (actionCounts24h.get(action) ?? 0) + 1);

          const actorKey = `${row.user_id ?? "unknown"}:${row.user_email ?? ""}`;
          const actor = adminCounts24h.get(actorKey) ?? { user_id: row.user_id, user_email: row.user_email, count: 0 };
          actor.count += 1;
          adminCounts24h.set(actorKey, actor);

          const bucket = row.status_code >= 500
            ? "5xx"
            : row.status_code >= 400
            ? "4xx"
            : row.status_code >= 300
            ? "3xx"
            : row.status_code >= 200
            ? "2xx"
            : "other";
          statusBuckets24h.set(bucket, (statusBuckets24h.get(bucket) ?? 0) + 1);
        }

        adminActivity = {
          available: true,
          requests_24h: requests24h,
          failed_requests_24h: failed24h,
          unique_admins_24h: admins24h.size,
          top_actions_24h: Array.from(actionCounts24h.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([action, count]) => ({ action, count })),
          top_admins_24h: Array.from(adminCounts24h.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 8),
          status_buckets_24h: Array.from(statusBuckets24h.entries())
            .sort((a, b) => b[1] - a[1])
            .map(([bucket, count]) => ({ bucket, count })),
          daily_requests_30d: days30.map((day) => ({ day, count: dailyMap.get(day) ?? 0 })),
          recent_events: recent.map((row) => ({
            created_at: row.created_at,
            user_id: row.user_id,
            user_email: row.user_email,
            action: row.action,
            method: row.method,
            path: row.path,
            status_code: row.status_code,
            permission_key: row.permission_key,
            ip: row.ip,
            request_id: row.request_id,
          })),
        };

        adminAuditTruncated = auditLoad.truncated;
        if (auditLoad.truncated) {
          console.warn(`[admin-analytics] Truncated dataset "admin_audit_logs_30d" at ${auditLoad.rows.length} rows`);
        }
      } catch (_err) {
        reliabilityUnavailableSources.push("admin_audit_logs");
      }
    }

    const signupsByDay = new Map<string, number>(days30.map((d) => [d, 0]));
    const sessionsByDay = new Map<string, number>(days30.map((d) => [d, 0]));
    const paidByDay = new Map<string, { count: number; revenue: number }>(days30.map((d) => [d, { count: 0, revenue: 0 }]));
    const grantErrorsByDay = new Map<string, number>(days30.map((d) => [d, 0]));

    const visits24hUsers = new Set<string>();
    const visits7dUsers = new Set<string>();
    const visits30dUsers = new Set<string>();

    const productUsage = new Map<string, ProductUsage>();
    const productUsers = new Map<string, Set<string>>();
    const ensureProductUsage = (product: ProductRow): ProductUsage => {
      const found = productUsage.get(product.id);
      if (found) return found;
      const next: ProductUsage = {
        product_id: product.id,
        name: product.name,
        type: product.type,
        status: product.status,
        sessions_30d: 0,
        users_30d: 0,
        active_entitlements: 0,
        paid_payments_30d: 0,
        revenue_30d: 0,
      };
      productUsage.set(product.id, next);
      productUsers.set(product.id, new Set<string>());
      return next;
    };

    const productById = new Map(products.map((p) => [p.id, p]));
    for (const product of products) ensureProductUsage(product);

    for (const row of users30Load.rows) {
      const key = toDayKey(row.created_at);
      signupsByDay.set(key, (signupsByDay.get(key) ?? 0) + 1);
    }

    for (const row of sessions30Load.rows) {
      const day = toDayKey(row.created_at);
      sessionsByDay.set(day, (sessionsByDay.get(day) ?? 0) + 1);

      const createdMs = Date.parse(row.created_at);
      if (row.user_id) {
        visits30dUsers.add(row.user_id);
        if (createdMs >= since7Ms) visits7dUsers.add(row.user_id);
        if (createdMs >= since24Ms) visits24hUsers.add(row.user_id);
      }

      const productId = row.experience_id ? experienceToProduct.get(row.experience_id) : undefined;
      if (!productId) continue;
      const product = productById.get(productId);
      if (!product) continue;
      const usage = ensureProductUsage(product);
      usage.sessions_30d += 1;
      if (row.user_id) productUsers.get(productId)?.add(row.user_id);
    }

    let paidPayments30d = 0;
    let revenue30d = 0;
    let grantErrors30d = 0;
    for (const row of payments30Load.rows) {
      const day = toDayKey(row.created_at);
      if (row.grant_error) {
        grantErrors30d += 1;
        grantErrorsByDay.set(day, (grantErrorsByDay.get(day) ?? 0) + 1);
      }

      const status = normalizeStatus(row.status);
      if (!successStatuses.has(status)) continue;
      const amount = Number.isFinite(Number(row.amount)) ? Number(row.amount) : 0;
      const dayAgg = paidByDay.get(day) ?? { count: 0, revenue: 0 };
      dayAgg.count += 1;
      dayAgg.revenue += amount;
      paidByDay.set(day, dayAgg);

      paidPayments30d += 1;
      revenue30d += amount;

      if (row.product_id && productById.has(row.product_id)) {
        const product = productById.get(row.product_id)!;
        const usage = ensureProductUsage(product);
        usage.paid_payments_30d += 1;
        usage.revenue_30d += amount;
      }
    }

    let activeEntitlements = 0;
    for (const row of entitlementsLoad.rows) {
      activeEntitlements += 1;
      if (row.resource_id && productById.has(row.resource_id)) {
        const product = productById.get(row.resource_id)!;
        const usage = ensureProductUsage(product);
        usage.active_entitlements += 1;
      }
    }

    for (const [productId, users] of productUsers.entries()) {
      const usage = productUsage.get(productId);
      if (usage) usage.users_30d = users.size;
    }

    const response = {
      generated_at: nowIso,
      totals: {
        users_total: usersTotal,
        users_new_7d: usersNew7d,
        users_new_30d: usersNew30d,
        visits_users_24h: visits24hUsers.size,
        visits_users_7d: visits7dUsers.size,
        visits_users_30d: visits30dUsers.size,
        sessions_total: sessionsTotal,
        sessions_7d: sessions7d,
        sessions_30d: sessions30d,
        sessions_completed_30d: sessionsCompleted30d,
        products_active: productsActive,
        plans_active: plansActive,
        entitlements_active: activeEntitlements,
        payments_total: paymentsTotal,
        payments_paid_ungranted_5m: paidUngranted5m,
        payments_paid_ungranted_30m: paidUngranted30m,
        payments_paid_ungranted_2h: paidUngranted2h,
        payments_paid_ungranted_24h: paidUngranted24h,
        payments_with_grant_error: paymentsWithGrantError,
        paid_payments_30d: paidPayments30d,
        revenue_30d: revenue30d,
      },
      trends_30d: {
        signups_by_day: days30.map((day): DailyPoint => ({ day, count: signupsByDay.get(day) ?? 0 })),
        sessions_by_day: days30.map((day): DailyPoint => ({ day, count: sessionsByDay.get(day) ?? 0 })),
        grant_errors_by_day: days30.map((day): DailyPoint => ({ day, count: grantErrorsByDay.get(day) ?? 0 })),
        paid_payments_by_day: days30.map((day): DailyRevenuePoint => {
          const item = paidByDay.get(day) ?? { count: 0, revenue: 0 };
          return { day, count: item.count, revenue: item.revenue };
        }),
      },
      reliability: {
        stale_paid_ungranted: {
          over_5m: paidUngranted5m,
          over_30m: paidUngranted30m,
          over_2h: paidUngranted2h,
          over_24h: paidUngranted24h,
        },
        grant_errors_30d: grantErrors30d,
        hard_delete_blocks_24h: hardDeleteBlocks24h,
        hard_delete_blocks_7d: hardDeleteBlocks7d,
        recent_hard_delete_blocks: recentHardDeleteBlocks.map((event) => ({
          table_name: event.table_name,
          row_id: event.row_id,
          actor_user_id: event.actor_user_id,
          created_at: event.created_at,
          details: event.details ?? {},
        })),
        unavailable_sources: reliabilityUnavailableSources,
      },
      services: Array.from(productUsage.values()).sort((a, b) => {
        if (b.sessions_30d !== a.sessions_30d) return b.sessions_30d - a.sessions_30d;
        return a.name.localeCompare(b.name);
      }),
      admin_activity: adminActivity,
      diagnostics: {
        truncated_sources: [
          ...(sessions30Load.truncated ? ["sessions_30d"] : []),
          ...(payments30Load.truncated ? ["payments_30d"] : []),
          ...(users30Load.truncated ? ["users_30d"] : []),
          ...(entitlementsLoad.truncated ? ["entitlements_active"] : []),
          ...(adminAuditTruncated ? ["admin_audit_logs_30d"] : []),
        ],
      },
    };

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});

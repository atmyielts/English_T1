import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type RecordRow = Record<string, unknown>;
type AdapterResult<T> = { ok: true; data: T } | { ok: false; error: string };

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { "Content-Type": "application/json", ...corsHeaders },
});

const env = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

const bearer = (req: Request): string | null => {
  const value = req.headers.get("authorization") ?? "";
  return value.toLowerCase().startsWith("bearer ") ? value.slice(7).trim() || null : null;
};

const asRecord = (value: unknown): RecordRow =>
  value && typeof value === "object" && !Array.isArray(value) ? value as RecordRow : {};

const asRows = (value: unknown): RecordRow[] => Array.isArray(value)
  ? value.filter((row): row is RecordRow => !!row && typeof row === "object" && !Array.isArray(row))
  : [];

const text = (value: unknown): string => typeof value === "string" ? value : "";

const settle = async <T>(name: string, task: Promise<T>, timeoutMs = 4_000): Promise<AdapterResult<T>> => {
  let timer: number | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${name} timed out`)), timeoutMs);
    });
    return { ok: true, data: await Promise.race([task, timeout]) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET") return json(405, { error: "Method not allowed" });

  try {
    const token = bearer(req);
    if (!token) return json(401, { error: "Unauthorized" });

    const supabaseUrl = env("SUPABASE_URL");
    const anonKey = env("SUPABASE_ANON_KEY");
    const serviceKey = env("SUPABASE_SERVICE_ROLE_KEY");
    const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return json(401, { error: "Unauthorized" });

    const user = authData.user;
    const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const academyRequest = fetch(`${supabaseUrl}/functions/v1/academy?action=student-dashboard`, {
      headers: { Authorization: `Bearer ${token}`, apikey: anonKey, "x-user-jwt": token },
    }).then(async (response) => {
      if (!response.ok) throw new Error(`Academy returned ${response.status}`);
      return asRecord(await response.json());
    });

    const accessRequest = Promise.all([
      sb.from("entitlements")
        .select("id,resource_type,resource_id,is_active,starts_at,ends_at,usage_limit,usage_count,source,created_at")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(200),
      sb.from("products").select("id,name,type,status,description,metadata").eq("status", "active").limit(200),
    ]).then(([entitlements, products]) => {
      if (entitlements.error) throw new Error(entitlements.error.message);
      if (products.error) throw new Error(products.error.message);
      return { entitlements: entitlements.data ?? [], products: products.data ?? [] };
    });

    const learningRequest = Promise.all([
      sb.from("learner_language_goals")
        .select("user_id,language_id,product_id,target_cefr,goal_keys,daily_time_minutes,metadata,updated_at")
        .eq("user_id", user.id)
        .limit(20),
      sb.from("learner_language_daily_plans")
        .select("id,language_id,plan_date,minutes_budget,total_estimated_minutes,status,tasks,summary,updated_at")
        .eq("user_id", user.id)
        .in("status", ["active", "completed"])
        .order("plan_date", { ascending: false })
        .limit(7),
      sb.from("learning_attempts")
        .select("id,product_id,service_key,status,overall_score,started_at,submitted_at,scored_at,metadata")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(80),
      sb.from("exam_outcomes")
        .select("id,product_id,experience_id,status,overall_score,overall_band,section_scores,computed_at")
        .eq("user_id", user.id)
        .order("computed_at", { ascending: false })
        .limit(40),
    ]).then(([goals, plans, attempts, outcomes]) => {
      const firstError = goals.error ?? plans.error ?? attempts.error ?? outcomes.error;
      if (firstError) throw new Error(firstError.message);
      return {
        goals: goals.data ?? [],
        plans: plans.data ?? [],
        attempts: attempts.data ?? [],
        outcomes: outcomes.data ?? [],
      };
    });

    const [academy, access, learning] = await Promise.all([
      settle("academy", academyRequest),
      settle("access", accessRequest),
      settle("learning", learningRequest),
    ]);

    const partialErrors: Array<{ source: string; message: string; retryable: boolean }> = [];
    if (!academy.ok) partialErrors.push({ source: "academy", message: academy.error, retryable: true });
    if (!access.ok) partialErrors.push({ source: "access", message: access.error, retryable: true });
    if (!learning.ok) partialErrors.push({ source: "learning", message: learning.error, retryable: true });

    const academyData = academy.ok ? academy.data : {};
    const academies = asRows(academyData.academies);
    const classrooms = asRows(academyData.classrooms);
    const academyById = new Map(academies.map((row) => [text(row.id), text(row.name)]));
    const classroomById = new Map(classrooms.map((row) => [text(row.id), row]));

    const products = access.ok ? asRows(access.data.products) : [];
    const productById = new Map(products.map((row) => [text(row.id), row]));
    const entitlements = access.ok ? asRows(access.data.entitlements) : [];
    const entitledProductIds = new Set(
      entitlements.filter((row) => row.resource_type === "product" && row.resource_id).map((row) => text(row.resource_id)),
    );
    const accessRows = [
      ...entitlements.map((row) => {
        const product = productById.get(text(row.resource_id)) ?? {};
        return {
          id: `platform:${text(row.id)}`,
          source: "platform",
          title: text(product.name) || text(row.resource_type) || "Platform access",
          status: row.is_active === true ? "active" : "inactive",
          expires_at: row.ends_at ?? null,
          href: "/account",
        };
      }),
      ...asRows(academyData.entitlements).map((row) => ({
        id: `academy:${text(row.id)}`,
        source: "academy",
        title: academyById.get(text(row.academy_id)) || text(row.capability_key) || "Academy access",
        status: text(row.status) || "active",
        expires_at: row.expires_at ?? null,
        href: `https://academy.schood.online/academy/student/payments?academy_id=${encodeURIComponent(text(row.academy_id))}`,
      })),
    ];

    const services = [
      ...classrooms.map((classroom) => ({
        id: `academy:${text(classroom.id)}`,
        source: "academy",
        kind: "classroom",
        title: text(classroom.name) || "Classroom",
        subtitle: academyById.get(text(classroom.academy_id)) || "Academy",
        status: classroom.is_active === false ? "inactive" : "active",
        href: `https://academy.schood.online/academy/student/classrooms/${encodeURIComponent(text(classroom.id))}?academy_id=${encodeURIComponent(text(classroom.academy_id))}`,
        metadata: { academy_id: classroom.academy_id, classroom_id: classroom.id },
      })),
      ...Array.from(entitledProductIds).map((productId) => {
        const product = productById.get(productId) ?? {};
        const metadata = asRecord(product.metadata);
        return {
          id: `product:${productId}`,
          source: "platform",
          kind: text(product.type) || "product",
          title: text(product.name) || "Learning service",
          subtitle: text(product.description),
          status: "active",
          href: text(metadata.app_url) || "/account",
          metadata: { product_id: productId },
        };
      }),
    ];

    const submissions = asRows(academyData.submissions);
    const submissionByAssignment = new Map(submissions.map((row) => [text(row.assignment_id), row]));
    const nextActions: RecordRow[] = [];
    for (const assignment of asRows(academyData.assignments)) {
      const submission = submissionByAssignment.get(text(assignment.id));
      if (submission && ["submitted", "graded"].includes(text(submission.status))) continue;
      nextActions.push({
        id: `assignment:${text(assignment.id)}`,
        source: "academy",
        kind: "assignment",
        title: text(assignment.title) || "Assignment",
        context: text(classroomById.get(text(assignment.classroom_id))?.name) || "Classroom",
        due_at: assignment.due_at ?? null,
        priority: assignment.due_at && Date.parse(text(assignment.due_at)) < Date.now() ? "urgent" : "normal",
        href: `https://academy.schood.online/academy/student/classrooms/${encodeURIComponent(text(assignment.classroom_id))}?academy_id=${encodeURIComponent(text(assignment.academy_id))}&section=assignments`,
      });
    }
    for (const alert of asRows(academyData.alerts).filter((row) => row.resolved !== true)) {
      nextActions.push({
        id: `alert:${text(alert.id)}`,
        source: "academy",
        kind: "alert",
        title: text(alert.message) || "Academy update needs attention",
        context: academyById.get(text(alert.academy_id)) || "Academy",
        due_at: null,
        priority: text(alert.severity) === "critical" ? "urgent" : "normal",
        href: "https://academy.schood.online/academy/student/updates",
      });
    }
    if (learning.ok) {
      for (const plan of asRows(learning.data.plans).filter((row) => row.status === "active").slice(0, 1)) {
        const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
        tasks.slice(0, 12).forEach((raw, index) => {
          const task = asRecord(raw);
          if (task.completed === true || task.status === "completed") return;
          nextActions.push({
            id: `plan:${text(plan.id)}:${index}`,
            source: "english",
            kind: "study_plan",
            title: text(task.title) || text(task.label) || "Continue today’s learning plan",
            context: "English Hub",
            due_at: `${text(plan.plan_date)}T23:59:59Z`,
            priority: "normal",
            href: "https://english.schood.online/",
          });
        });
      }
    }

    const calendar = asRows(academyData.sessions).map((session) => ({
      id: `session:${text(session.id)}`,
      source: "academy",
      kind: "class_session",
      title: text(session.title) || "Class session",
      context: text(classroomById.get(text(session.classroom_id))?.name) || "Classroom",
      starts_at: session.starts_at,
      ends_at: session.ends_at,
      status: session.status,
      delivery_mode: session.delivery_mode,
      join_available: session.join_available === true,
      join_url: session.join_available === true ? session.join_url ?? null : null,
      href: session.join_available === true && session.join_url
        ? session.join_url
        : `https://academy.schood.online/academy/student/classrooms/${encodeURIComponent(text(session.classroom_id))}?academy_id=${encodeURIComponent(text(session.academy_id))}&section=live`,
    }));

    const communications = [
      ...asRows(academyData.announcements).map((row) => ({
        id: `announcement:${text(row.id)}`,
        source: "academy",
        kind: "announcement",
        title: text(row.title) || "Academy announcement",
        body: text(row.body),
        created_at: row.created_at,
        context: academyById.get(text(row.academy_id)) || "Academy",
      })),
      ...asRows(academyData.messages).map((row) => ({
        id: `message:${text(row.id)}`,
        source: "academy",
        kind: "message",
        title: text(row.sender_type) === "student" ? "Your message" : "Classroom message",
        body: text(row.content),
        created_at: row.created_at,
        context: academyById.get(text(row.academy_id)) || "Academy",
      })),
    ].sort((left, right) => Date.parse(text(right.created_at)) - Date.parse(text(left.created_at))).slice(0, 30);

    const progress: RecordRow[] = [];
    const lessonProgress = asRows(academyData.lesson_progress);
    for (const classroom of classrooms) {
      const rows = lessonProgress.filter((row) => row.classroom_id === classroom.id);
      const completed = rows.filter((row) => row.status === "completed").length;
      progress.push({
        id: `academy:${text(classroom.id)}`,
        source: "academy",
        title: text(classroom.name) || "Classroom",
        completed,
        total: rows.length,
        percent: rows.length ? Math.round(completed / rows.length * 100) : null,
        href: `https://academy.schood.online/academy/student/classrooms/${encodeURIComponent(text(classroom.id))}?academy_id=${encodeURIComponent(text(classroom.academy_id))}&section=progress`,
      });
    }
    if (learning.ok) {
      for (const outcome of asRows(learning.data.outcomes).slice(0, 12)) {
        const product = productById.get(text(outcome.product_id)) ?? {};
        progress.push({
          id: `outcome:${text(outcome.id)}`,
          source: "test_prep",
          title: text(product.name) || "Assessment",
          completed: 1,
          total: 1,
          percent: typeof outcome.overall_score === "number" ? Math.round(Number(outcome.overall_score)) : null,
          score: outcome.overall_band ?? outcome.overall_score ?? null,
          href: text(asRecord(product.metadata).app_url) || "/account",
        });
      }
    }

    nextActions.sort((left, right) => {
      if (left.priority === "urgent" && right.priority !== "urgent") return -1;
      if (right.priority === "urgent" && left.priority !== "urgent") return 1;
      const leftTime = left.due_at ? Date.parse(text(left.due_at)) : Number.MAX_SAFE_INTEGER;
      const rightTime = right.due_at ? Date.parse(text(right.due_at)) : Number.MAX_SAFE_INTEGER;
      return leftTime - rightTime;
    });

    return json(200, {
      identity: { id: user.id, email: user.email ?? null },
      services,
      next_actions: nextActions.slice(0, 40),
      calendar: calendar.slice(0, 60),
      progress: progress.slice(0, 40),
      communications,
      access: accessRows,
      partial_errors: partialErrors,
      generated_at: new Date().toISOString(),
    });
  } catch (error) {
    return json(500, { error: "Failed to load Student Center", detail: error instanceof Error ? error.message : String(error) });
  }
});

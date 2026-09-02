import type { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { academyAccessHas, type MembershipRow } from "./access.ts";
import {
  type AssessmentItem,
  assessmentSkills,
  assessmentSummary,
} from "../_shared/academy-assessment-core.ts";
import { diagnosticStarter } from "../_shared/academy-diagnostic-starter.ts";

// deno-lint-ignore no-explicit-any
type Client = ReturnType<typeof createClient<any>>;
type Row = Record<string, unknown>;
export type OperationsContext = {
  academyId: string;
  userId: string;
  access: MembershipRow;
  runs: Row[];
  papers: Row[];
  candidates: Row[];
  classrooms: Row[];
  contacts: Row[];
  canRun: boolean;
  canReview: boolean;
  canCreate: boolean;
  unscoped: boolean;
};
const text = (v: unknown, n = 200) => String(v ?? "").trim().slice(0, n);
const checked = <T>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
const rows = (v: unknown) => (v ?? []) as Row[];
function forbid(): never {
  throw new Error("Forbidden");
}
const numeric = (value: unknown, min: number, max: number) => {
  const n = Number(value);
  if (
    value === "" || value === null || !Number.isFinite(n) || n < min || n > max
  ) throw new Error("Check the amount or score range.");
  return n;
};
const note = (value: unknown, min = 10, max = 3000) => {
  const n = text(value, max);
  if (n.length < min) {
    throw new Error(
      "Add enough detail for another member of staff to understand the decision.",
    );
  }
  return n;
};
const date = (value: unknown) => {
  const parsed = Date.parse(text(value));
  if (!Number.isFinite(parsed)) {
    throw new Error("Choose a valid date and time.");
  }
  return new Date(parsed).toISOString();
};
export const operationsActions = [
  "starter_paper",
  "paper_review",
  "course_rule",
  "retire_rule",
  "run_settings",
  "check_in",
  "assign_grader",
  "moderate",
  "incident",
  "resolve_incident",
  "reopen",
  "certificate",
  "revoke_certificate",
  "support_plan",
  "complete_support",
  "service_order",
  "transition_order",
  "create_package",
  "grant_package",
  "use_allowance",
].map((a) => `assessment_${a}`);

async function staffOptions(
  sb: Client,
  ctx: OperationsContext,
): Promise<Row[]> {
  const staff = rows(
    checked(
      await sb.from("academy_staff").select(
        "id,user_id,display_name,role,classroom_ids",
      ).eq("academy_id", ctx.academyId).eq("is_active", true).limit(1000),
    ),
  );
  // Assignment is not an access grant. Only already authorized classroom reviewers can be selected.
  return staff.filter((s) =>
    s.user_id &&
    ["owner", "admin", "teacher", "assistant"].includes(text(s.role))
  ).map((s) => ({
    ...s,
    classroom_ids: Array.isArray(s.classroom_ids) ? s.classroom_ids : [],
  }));
}
export async function operationsWorkspace(
  sb: Client,
  ctx: OperationsContext,
): Promise<Row> {
  const runIds = ctx.runs.map((r) => r.id);
  const candidateIds = ctx.candidates.map((c) => c.id);
  const paperIds = ctx.papers.map((p) => p.id);
  const scoped = async (table: string, column: string, ids: unknown[]) =>
    ids.length
      ? rows(
        checked(
          await sb.from(table).select("*").eq("academy_id", ctx.academyId).in(
            column,
            ids,
          ).limit(5000),
        ),
      )
      : [];
  const finance = academyAccessHas(ctx.access, "manageFinance");
  const [
    reviews,
    rules,
    incidents,
    certificates,
    support,
    orders,
    staff,
    packages,
    allowances,
    uses,
    subscriptions,
    branches,
  ] = await Promise.all([
    scoped("academy_assessment_paper_reviews", "paper_id", paperIds),
    scoped("academy_assessment_course_rules", "paper_id", paperIds),
    scoped("academy_assessment_incidents", "candidate_id", candidateIds),
    scoped("academy_assessment_certificates", "candidate_id", candidateIds),
    scoped("academy_assessment_support_plans", "candidate_id", candidateIds),
    scoped("academy_assessment_service_orders", "run_id", runIds),
    staffOptions(sb, ctx),
    finance
      ? rows(
        checked(
          await sb.from("academy_assessment_packages").select("*").eq(
            "academy_id",
            ctx.academyId,
          ).limit(1000),
        ),
      )
      : [],
    finance
      ? await scoped(
        "academy_assessment_allowances",
        "contact_id",
        ctx.contacts.map((c) => c.id),
      )
      : [],
    finance
      ? await scoped(
        "academy_assessment_allowance_uses",
        "candidate_id",
        candidateIds,
      )
      : [],
    finance
      ? rows(
        checked(
          await sb.from("academy_subscriptions").select(
            "id,contact_id,starts_on,ends_on,status",
          ).eq("academy_id", ctx.academyId).eq("status", "active").in(
            "contact_id",
            ctx.contacts.length
              ? ctx.contacts.map((c) => c.id)
              : ["00000000-0000-0000-0000-000000000000"],
          ).limit(5000),
        ),
      )
      : [],
    rows(
      checked(
        await sb.from("academy_branches").select("id,name").eq(
          "academy_id",
          ctx.academyId,
        ).limit(2000),
      ),
    ),
  ]);
  const released = ctx.candidates.filter((c) =>
    ctx.canReview || c.status === "released"
  );
  const suggestions = released.map((c) => {
    const run = ctx.runs.find((r) => r.id === c.run_id)!;
    const paper = ctx.papers.find((p) => p.id === run?.paper_id);
    const summary = paper
      ? assessmentSummary(
        paper.items as AssessmentItem[],
        c.marks as Record<string, number>,
      )
      : null;
    const eligible = rules.filter((rule) =>
      rule.status === "active" && rule.paper_id === run.paper_id &&
      summary?.percent !== null && summary &&
      summary.percent! >= Number(rule.minimum_percent) &&
      summary.percent! <= Number(rule.maximum_percent) &&
      (rule.required_skills as Array<{ skill: string; minimum: number }>).every(
        (req) => {
          const s = summary.skills.find((s) => s.skill === req.skill);
          return s?.percent !== null && s?.percent !== undefined &&
            s.percent >= req.minimum;
        },
      )
    );
    return {
      candidate_id: c.id,
      rules: eligible.map((rule) => ({
        id: rule.id,
        course_name: rule.course_name,
        evidence: rule.evidence,
      })),
    };
  });
  return {
    current_user_id: ctx.userId,
    reviews,
    rules,
    incidents,
    certificates,
    support,
    orders: ctx.canRun ? orders : [],
    staff: [
      {
        user_id: ctx.userId,
        display_name: "You",
        classroom_ids: ctx.classrooms.map((c) => c.id),
      },
      ...staff.filter((s) =>
        s.user_id !== ctx.userId &&
        (ctx.unscoped || (s.classroom_ids as unknown[]).some((id) =>
          ctx.classrooms.some((c) => c.id === id)
        ))
      ),
    ],
    packages,
    allowances,
    uses,
    subscriptions,
    branches: branches.filter((b) =>
      ctx.classrooms.some((c) => c.branch_id === b.id)
    ),
    suggestions,
    permissions: {
      finance,
      certificates: academyAccessHas(ctx.access, "issueCertificates"),
      support: ctx.canReview || academyAccessHas(ctx.access, "manageRetention"),
    },
    limited: [
      reviews,
      rules,
      incidents,
      certificates,
      support,
      orders,
      allowances,
      uses,
      subscriptions,
    ].some((list) => list.length >= 1000) || staff.length === 1000 ||
      packages.length === 1000 || branches.length === 2000,
  };
}

export async function handleOperations(
  sb: Client,
  action: string,
  body: Row,
  ctx: OperationsContext,
): Promise<Row> {
  const { academyId, userId, canRun, canReview, canCreate } = ctx;
  const command = action.replace("assessment_", "");
  const paper = ctx.papers.find((p) => p.id === body.paper_id);
  const run = ctx.runs.find((r) => r.id === body.run_id);
  const candidate = ctx.candidates.find((c) => c.id === body.candidate_id);
  const staff = await staffOptions(sb, ctx);
  const staffAllowed = (id: unknown, targetRun?: Row, grader = false) => {
    if (id === userId && (!grader || canReview)) return true;
    const s = staff.find((s) => s.user_id === id);
    if (!s) return false;
    if (["owner", "admin"].includes(text(s.role))) return true;
    if (
      targetRun && !targetRun.classroom_id &&
      ctx.papers.some((p) => p.id === targetRun.paper_id && p.created_by === id)
    ) return true;
    return Boolean(
      targetRun?.classroom_id &&
        (s.classroom_ids as unknown[]).includes(targetRun.classroom_id),
    );
  };
  const insert = async (table: string, payload: Row) =>
    checked(
      await sb.from(table).insert({ academy_id: academyId, ...payload }).select(
        "*",
      ).single(),
    ) as Row;
  if (command === "starter_paper") {
    if (!canCreate) forbid();
    return {
      paper: await insert("academy_assessment_papers", {
        ...diagnosticStarter(),
        created_by: userId,
      }),
    };
  }
  if (command === "paper_review") {
    if (!canReview || !paper) forbid();
    if (!["pilot_ready", "changes_needed"].includes(text(body.decision))) {
      forbid();
    }
    return {
      review: await insert("academy_assessment_paper_reviews", {
        paper_id: paper.id,
        decision: body.decision,
        evidence: note(body.evidence, 40, 5000),
        reviewed_by: userId,
      }),
    };
  }
  if (command === "course_rule") {
    if (!canReview || !paper) forbid();
    const course_name = note(body.course_name, 1, 200);
    const minimum_percent = numeric(body.minimum_percent, 0, 100),
      maximum_percent = numeric(body.maximum_percent, minimum_percent, 100);
    const required = Array.isArray(body.required_skills)
      ? body.required_skills as Row[]
      : [];
    if (
      required.length > 6 ||
      required.some((s) =>
        !assessmentSkills.includes(s.skill as typeof assessmentSkills[number])
      )
    ) throw new Error("Choose the assessed skills needed for this course.");
    const required_skills = required.map((s) => ({
      skill: s.skill,
      minimum: numeric(s.minimum, 0, 100),
    }));
    return {
      rule: await insert("academy_assessment_course_rules", {
        paper_id: paper.id,
        course_name,
        minimum_percent,
        maximum_percent,
        required_skills,
        evidence: note(body.evidence, 40, 5000),
        created_by: userId,
      }),
    };
  }
  if (command === "retire_rule") {
    if (!canReview || !paper) forbid();
    return {
      rule: checked(
        await sb.from("academy_assessment_course_rules").update({
          status: "retired",
        }).eq("academy_id", academyId).eq("paper_id", paper.id).eq(
          "id",
          body.rule_id,
        ).select("*").single(),
      ),
    };
  }
  if (command === "run_settings") {
    if (!canRun || !run || run.status !== "draft") forbid();
    if (
      body.teaching_user_id && !staffAllowed(body.teaching_user_id, run, true)
    ) forbid();
    const expected = text(body.expected_level, 10);
    if (
      !["", "Pre-A1", "A1", "A2", "B1", "B2", "C1", "C2"].includes(expected)
    ) forbid();
    return {
      run: checked(
        await sb.from("academy_assessment_runs").update({
          require_check_in: body.require_check_in === true,
          require_moderation: body.require_moderation === true,
          teaching_user_id: body.teaching_user_id || null,
          expected_level: expected,
        }).eq("academy_id", academyId).eq("id", run.id).eq("status", "draft")
          .select("*").single(),
      ),
    };
  }
  if (
    [
      "check_in",
      "assign_grader",
      "moderate",
      "incident",
      "resolve_incident",
      "reopen",
      "certificate",
      "revoke_certificate",
    ].includes(command)
  ) {
    if (!candidate) forbid();
    if (["check_in", "assign_grader"].includes(command) && !canRun) forbid();
    if (
      ["moderate", "resolve_incident", "reopen"].includes(command) && !canReview
    ) forbid();
    if (command === "incident" && !canRun && !canReview) forbid();
    if (
      ["certificate", "revoke_certificate"].includes(command) &&
      !academyAccessHas(ctx.access, "issueCertificates")
    ) forbid();
    const payload: Row = {};
    if (command === "check_in") {
      const extra = numeric(body.extra_minutes ?? 0, 0, 120);
      if (!Number.isInteger(extra)) {
        throw new Error("Extra time must be a whole number of minutes.");
      }
      Object.assign(payload, {
        seat: text(body.seat, 40),
        extra_minutes: extra,
        note: extra > 0 ? note(body.note) : text(body.note, 3000),
      });
    } else if (command === "assign_grader") {
      const r = ctx.runs.find((r) => r.id === candidate.run_id);
      if (!staffAllowed(body.grader_id, r, true)) {
        throw new Error(
          "Choose a teacher who already has access to this group. Intake sessions can be reviewed by their paper author or an academy administrator.",
        );
      }
      Object.assign(payload, {
        grader_id: body.grader_id,
        grading_due_at: date(body.grading_due_at),
      });
    } else if (command === "certificate") {
      const r = ctx.runs.find((r) => r.id === candidate.run_id)!;
      const p = ctx.papers.find((p) => p.id === r.paper_id)!;
      const learner = ctx.contacts.find((c) => c.id === candidate.contact_id)!;
      const academy = checked(
        await sb.from("tenants").select("name").eq("id", academyId).single(),
      ) as Row;
      payload.snapshot = {
        academy: academy.name,
        name: `${text(learner.first_name)} ${text(learner.last_name)}`.trim(),
        candidate_code: candidate.candidate_code,
        title: r.title,
        assessed_at: candidate.started_at,
        report: candidate.report,
        summary: assessmentSummary(
          p.items as AssessmentItem[],
          candidate.marks as Record<string, number>,
        ),
        classification:
          "Schood mock assessment — not an official IELTS result or CEFR certificate",
      };
    } else {
      payload.note = note(
        body.note,
        ["moderate", "reopen"].includes(command) ? 20 : 10,
      );
      if (command === "incident") {
        if (
          !["technical", "wellbeing", "integrity", "appeal"].includes(
            text(body.kind),
          )
        ) forbid();
        payload.kind = body.kind;
      }
      if (command === "resolve_incident") {
        payload.incident_id = text(body.incident_id, 64);
      }
    }
    return {
      result: checked(
        await sb.rpc("academy_assessment_ops_command", {
          p_academy_id: academyId,
          p_candidate_id: candidate.id,
          p_action: command,
          p_actor_id: userId,
          p_payload: payload,
        }),
      ),
    };
  }
  if (command === "support_plan") {
    if (
      !candidate ||
      (!canReview && !academyAccessHas(ctx.access, "manageRetention"))
    ) forbid();
    const r = ctx.runs.find((r) => r.id === candidate.run_id);
    if (!staffAllowed(body.assigned_to, r)) {
      throw new Error("Choose a staff member with access to this learner.");
    }
    return {
      plan: await insert("academy_assessment_support_plans", {
        candidate_id: candidate.id,
        assigned_to: body.assigned_to,
        goal: note(body.goal),
        due_on: date(body.due_on).slice(0, 10),
        created_by: userId,
      }),
    };
  }
  if (command === "complete_support") {
    if (
      !candidate ||
      (!canReview && !academyAccessHas(ctx.access, "manageRetention"))
    ) forbid();
    return {
      plan: checked(
        await sb.from("academy_assessment_support_plans").update({
          status: "completed",
          outcome: note(body.outcome),
          completed_at: new Date().toISOString(),
        }).eq("academy_id", academyId).eq("candidate_id", candidate.id).eq(
          "id",
          body.plan_id,
        ).eq("status", "open").select("*").single(),
      ),
    };
  }
  if (command === "service_order") {
    if (!canRun || !run) forbid();
    return {
      order: await insert("academy_assessment_service_orders", {
        run_id: run.id,
        service_kind: run.kind,
        brief: note(body.brief, 10, 5000),
        due_at: date(body.due_at),
        created_by: userId,
      }),
    };
  }
  if (command === "transition_order") {
    if (!canRun || !run) forbid();
    const order = checked(
      await sb.from("academy_assessment_service_orders").select("*").eq(
        "academy_id",
        academyId,
      ).eq("run_id", run.id).single(),
    ) as Row;
    const transitions: Record<string, string[]> = {
      requested: ["confirmed", "cancelled"],
      confirmed: ["in_progress", "cancelled"],
      in_progress: ["delivered", "cancelled"],
      delivered: [],
      cancelled: [],
    };
    const next = text(body.status);
    if (!transitions[text(order.status)]?.includes(next)) {
      throw new Error(
        "Refresh this service request before changing its status.",
      );
    }
    const patch: Row = { status: next, updated_at: new Date().toISOString() };
    if (next === "confirmed") {
      if (!staffAllowed(body.coordinator_id, run)) {
        throw new Error("Choose an authorized coordinator.");
      }
      Object.assign(patch, {
        coordinator_id: body.coordinator_id,
        provider_name: note(body.provider_name, 2, 200),
        agreed_amount: numeric(body.agreed_amount, 0, 1000000000),
        acceptance_note: note(body.note, 20),
      });
      if (!Number.isInteger(patch.agreed_amount)) {
        throw new Error("Enter the agreed price in whole UZS.");
      }
    } else patch.delivery_note = note(body.note);
    if (
      next === "delivered" &&
      (!ctx.candidates.some((c) => c.run_id === run.id) ||
        ctx.candidates.some((c) =>
          c.run_id === run.id && c.status !== "released"
        ))
    ) {
      throw new Error(
        "Share all candidate reports before marking the service delivered.",
      );
    }
    return {
      order: checked(
        await sb.from("academy_assessment_service_orders").update(patch).eq(
          "academy_id",
          academyId,
        ).eq("id", order.id).eq("status", order.status).select("*").single(),
      ),
    };
  }
  if (["create_package", "grant_package", "use_allowance"].includes(command)) {
    if (!academyAccessHas(ctx.access, "manageFinance")) forbid();
    if (command === "create_package") {
      const price = numeric(body.price, 0, 1000000000),
        assessments = numeric(body.assessments, 1, 100),
        valid_days = numeric(body.valid_days, 1, 730);
      if (![price, assessments, valid_days].every(Number.isInteger)) {
        throw new Error("Use whole numbers for price, assessments and days.");
      }
      return {
        package: await insert("academy_assessment_packages", {
          name: note(body.name, 1, 200),
          price,
          assessments,
          valid_days,
          created_by: userId,
        }),
      };
    }
    if (command === "grant_package") {
      if (!ctx.contacts.some((c) => c.id === body.contact_id)) forbid();
      return {
        allowance: checked(
          await sb.rpc("academy_assessment_grant_package", {
            p_academy_id: academyId,
            p_contact_id: body.contact_id,
            p_package_id: body.package_id,
            p_subscription_id: body.subscription_id || null,
            p_actor_id: userId,
            p_key: text(body.idempotency_key, 180),
          }),
        ),
      };
    }
    if (!candidate) forbid();
    return {
      use: checked(
        await sb.rpc("academy_assessment_use_allowance", {
          p_academy_id: academyId,
          p_candidate_id: candidate.id,
          p_allowance_id: body.allowance_id,
        }),
      ),
    };
  }
  return forbid();
}

export async function studentOperations(
  sb: Client,
  action: string,
  body: Row,
  candidate: Row,
  academyId: string,
  userId: string,
) {
  if (action === "assessment_student_certificate_consent") {
    return {
      result: checked(
        await sb.rpc("academy_assessment_ops_command", {
          p_academy_id: academyId,
          p_candidate_id: candidate.id,
          p_action: "certificate_consent",
          p_actor_id: userId,
          p_payload: { consent: body.consent === true },
        }),
      ),
    };
  }
  if (action === "assessment_student_appeal") {
    if (candidate.status !== "released") {
      throw new Error(
        "A result review can be requested after the report is shared.",
      );
    }
    const open = rows(
      checked(
        await sb.from("academy_assessment_incidents").select("id").eq(
          "academy_id",
          academyId,
        ).eq("candidate_id", candidate.id).eq("kind", "appeal").eq(
          "status",
          "open",
        ).limit(1),
      ),
    );
    if (open.length) {
      throw new Error(
        "Your review request is already open. Your center will follow up.",
      );
    }
    return {
      result: checked(
        await sb.rpc("academy_assessment_ops_command", {
          p_academy_id: academyId,
          p_candidate_id: candidate.id,
          p_action: "incident",
          p_actor_id: userId,
          p_payload: { kind: "appeal", note: note(body.note, 10) },
        }),
      ),
    };
  }
  throw new Error("Forbidden");
}

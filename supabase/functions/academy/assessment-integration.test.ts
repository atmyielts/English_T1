import { deepStrictEqual as equal, ok } from "node:assert/strict";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleAcademyRequest } from "./index.ts";
const url = Deno.env.get("SUPABASE_URL") || "",
  anon = Deno.env.get("SUPABASE_ANON_KEY") || "",
  service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!/^http:\/\/(?:127\.0\.0\.1|localhost):56321$/.test(url)) {
  throw new Error(
    "Integration tests only run against the isolated local QA project on port 56321.",
  );
}
const admin = createClient(url, service, { auth: { persistSession: false } });
const call = async (
  token: string,
  action: string,
  body: Record<string, unknown>,
) => {
  const response = await handleAcademyRequest(
    new Request(`${url}/functions/v1/academy`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ action, ...body }),
    }),
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(
      `${action}: ${data.error || data.detail || response.status}`,
    );
  }
  return data as Record<string, unknown>;
};
const denied = async (
  token: string,
  action: string,
  body: Record<string, unknown>,
  status = 403,
) => {
  const response = await handleAcademyRequest(
    new Request(`${url}/functions/v1/academy`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ action, ...body }),
    }),
  );
  equal(response.status, status);
  return response.json();
};
Deno.test({
  name:
    "authenticated owner, scoped teacher and learner complete an assessment without cross-tenant access",
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const suffix = crypto.randomUUID(), password = `L${crypto.randomUUID()}!a9`;
    const addUser = async (role: string) => {
      const email = `assessment-${role}-${suffix}@example.test`;
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (created.error) throw created.error;
      const signed = await createClient(url, anon).auth.signInWithPassword({
        email,
        password,
      });
      if (signed.error) throw signed.error;
      return {
        id: created.data.user.id,
        email,
        token: signed.data.session!.access_token,
      };
    };
    const owner = await addUser("owner"),
      teacher = await addUser("teacher"),
      learner = await addUser("learner"),
      outsider = await addUser("outsider");
    const academy = crypto.randomUUID(), other = crypto.randomUUID();
    const insert = async (
      table: string,
      value: Record<string, unknown> | Record<string, unknown>[],
    ) => {
      const result = await admin.from(table).insert(value).select("*");
      if (result.error) throw result.error;
      return result.data!;
    };
    await insert("tenants", [{
      id: academy,
      name: "Assessment integration QA",
      slug: `assessment-${suffix}`,
      type: "org",
      created_by: owner.id,
      metadata: { service_family: "academy" },
    }, {
      id: other,
      name: "Other QA",
      slug: `assessment-other-${suffix}`,
      type: "org",
      created_by: outsider.id,
      metadata: { service_family: "academy" },
    }]);
    await insert("tenant_memberships", [{
      tenant_id: academy,
      user_id: owner.id,
      role: "owner",
      status: "active",
    }, {
      tenant_id: other,
      user_id: outsider.id,
      role: "owner",
      status: "active",
    }]);
    const branch = (await insert("academy_branches", {
      academy_id: academy,
      branch_key: "main",
      name: "Main",
    }))[0];
    const classroom = (await insert("academy_classrooms", {
      academy_id: academy,
      branch_id: branch.id,
      name: "Group A17",
      created_by: owner.id,
    }))[0];
    await insert("academy_staff", [{
      academy_id: academy,
      user_id: teacher.id,
      email: teacher.email,
      display_name: "Teacher QA",
      role: "teacher",
      classroom_ids: [classroom.id],
      is_active: true,
      created_by: owner.id,
    }]);
    const contact = (await insert("academy_contacts", {
      academy_id: academy,
      primary_branch_id: branch.id,
      first_name: "Learner",
      last_name: "QA",
      email: learner.email,
      user_id: learner.id,
      status: "active",
      created_by: owner.id,
    }))[0];
    await insert("academy_classroom_memberships", {
      academy_id: academy,
      classroom_id: classroom.id,
      contact_id: contact.id,
      status: "active",
    });
    const starter = await call(owner.token, "assessment_starter_paper", {
      academy_id: academy,
    });
    const paper = starter.paper as Record<string, unknown>;
    await call(owner.token, "assessment_paper_review", {
      academy_id: academy,
      paper_id: paper.id,
      decision: "pilot_ready",
      evidence:
        "Every answer, prompt, listening instruction and rubric was checked for this local supervised pilot.",
    });
    const now = Date.now(),
      runResult = await call(owner.token, "assessment_create_run", {
        academy_id: academy,
        paper_id: paper.id,
        classroom_id: classroom.id,
        title: "Integration exam",
        kind: "exam",
        starts_at: new Date(now - 60000).toISOString(),
        ends_at: new Date(now + 7200000).toISOString(),
        capacity: 2,
        room: "QA room",
        instructions: "Local integration only.",
      });
    const run = runResult.run as Record<string, unknown>;
    await call(owner.token, "assessment_run_settings", {
      academy_id: academy,
      run_id: run.id,
      require_check_in: true,
      require_moderation: true,
      teaching_user_id: teacher.id,
      expected_level: "B1",
    });
    await call(owner.token, "assessment_register", {
      academy_id: academy,
      run_id: run.id,
      contact_ids: [contact.id],
    });
    const ownerWorkspace = await call(owner.token, "assessment_workspace", {
      academy_id: academy,
    });
    const candidate =
      (ownerWorkspace.candidates as Array<Record<string, unknown>>)[0];
    await call(owner.token, "assessment_check_in", {
      academy_id: academy,
      candidate_id: candidate.id,
      seat: "A17",
      extra_minutes: 5,
      note: "Five extra minutes agreed for this local accessibility check.",
    });
    await call(owner.token, "assessment_assign_grader", {
      academy_id: academy,
      candidate_id: candidate.id,
      grader_id: teacher.id,
      grading_due_at: new Date(now + 3600000).toISOString(),
    });
    await call(owner.token, "assessment_open", {
      academy_id: academy,
      run_id: run.id,
    });
    await denied(outsider.token, "assessment_workspace", {
      academy_id: academy,
    });
    let learnerList = await call(learner.token, "assessment_student_list", {
      academy_id: academy,
    });
    const own = (learnerList.candidates as Array<Record<string, unknown>>)[0];
    equal(own.id, candidate.id);
    equal(own.checked_in_at === null, false);
    const started = await call(learner.token, "assessment_student_start", {
      academy_id: academy,
      candidate_id: candidate.id,
    });
    const active = started.candidate as Record<string, unknown>,
      items = active.items as Array<Record<string, unknown>>;
    ok(items.length === 34);
    ok(items.every((item) =>
      !("correct" in item) && !("rubric" in item) &&
      !("listening_script" in item)
    ));
    const answers: Record<string, unknown> = {};
    for (const item of items) {
      answers[String(item.id)] = item.kind === "choice"
        ? 0
        : item.kind === "written"
        ? "A clear local integration response."
        : "";
    }
    await call(learner.token, "assessment_student_save", {
      academy_id: academy,
      candidate_id: candidate.id,
      answers,
    });
    await call(learner.token, "assessment_student_submit", {
      academy_id: academy,
      candidate_id: candidate.id,
      answers,
    });
    const teacherSpace = await call(teacher.token, "assessment_workspace", {
      academy_id: academy,
    });
    const reviewing =
      (teacherSpace.candidates as Array<Record<string, unknown>>).find((row) =>
        row.id === candidate.id
      )!;
    const markingPaper = (teacherSpace.papers as Array<Record<string, unknown>>)
      .find((row) => row.id === paper.id)!;
    const manual = Object.fromEntries(
      (markingPaper.items as Array<Record<string, unknown>>).filter((item) =>
        item.kind !== "choice"
      ).map((item) => [item.id, Number(item.points) / 2]),
    );
    await call(teacher.token, "assessment_review", {
      academy_id: academy,
      candidate_id: candidate.id,
      marks: manual,
      review_notes:
        "Writing and speaking evidence checked against the task rubrics.",
      report: {
        level: "",
        basis:
          "All six skill tasks reviewed; no CEFR or IELTS claim is made from this local pilot.",
        strengths: "Completed all sections.",
        recommended_course: "Center discussion required.",
        next_steps: "Discuss the evidence with the learner.",
        learning_plan: "Agree a follow-up after teaching.",
        support_needed: true,
      },
    });
    await denied(teacher.token, "assessment_release", {
      academy_id: other,
      candidate_id: candidate.id,
    });
    await call(owner.token, "assessment_moderate", {
      academy_id: academy,
      candidate_id: candidate.id,
      note:
        "Second review checked the responses, marks, evidence and limitations.",
    });
    await call(owner.token, "assessment_release", {
      academy_id: academy,
      candidate_id: candidate.id,
    });
    await denied(teacher.token, "assessment_create_package", {
      academy_id: academy,
      name: "Not authorized",
      price: 100,
      assessments: 1,
      valid_days: 30,
    });
    await denied(teacher.token, "assessment_certificate", {
      academy_id: academy,
      candidate_id: candidate.id,
    });
    const packageResult = await call(owner.token, "assessment_create_package", {
      academy_id: academy,
      name: "Local assessment pair",
      price: 150000,
      assessments: 2,
      valid_days: 30,
    });
    const packageId = (packageResult.package as Record<string, unknown>).id;
    const grantBody = {
      academy_id: academy,
      contact_id: contact.id,
      package_id: packageId,
      idempotency_key: `integration-${suffix}`,
    };
    const granted = await call(
      owner.token,
      "assessment_grant_package",
      grantBody,
    );
    const allowance = granted.allowance as Record<string, unknown>;
    equal(
      ((await call(owner.token, "assessment_grant_package", grantBody))
        .allowance as Record<string, unknown>).id,
      allowance.id,
    );
    ok(allowance.charge_id);
    const charge = await admin.from("academy_charges").select(
      "net_amount,status",
    ).eq("id", allowance.charge_id).single();
    if (charge.error) throw charge.error;
    equal(Number(charge.data.net_amount), 150000);
    equal(charge.data.status, "open");
    const ledger = await admin.from("academy_account_ledger_entries").select(
      "amount",
    ).eq("charge_id", allowance.charge_id);
    if (ledger.error) throw ledger.error;
    equal(ledger.data.length, 1);
    equal(Number(ledger.data[0].amount), 150000);
    const useBody = {
      academy_id: academy,
      candidate_id: candidate.id,
      allowance_id: allowance.id,
    };
    await call(owner.token, "assessment_use_allowance", useBody);
    await call(owner.token, "assessment_use_allowance", useBody);
    const used = await admin.from("academy_assessment_allowances").select(
      "used",
    ).eq("id", allowance.id).single();
    if (used.error) throw used.error;
    equal(used.data.used, 1);
    await call(owner.token, "assessment_service_order", {
      academy_id: academy,
      run_id: run.id,
      brief: "Supervised local exam delivery with independent moderation.",
      due_at: new Date(now + 86400000).toISOString(),
    });
    await call(owner.token, "assessment_transition_order", {
      academy_id: academy,
      run_id: run.id,
      status: "confirmed",
      coordinator_id: owner.id,
      provider_name: "Local QA center",
      agreed_amount: 0,
      note: "The local QA center has agreed to run and review this assessment.",
    });
    await call(owner.token, "assessment_transition_order", {
      academy_id: academy,
      run_id: run.id,
      status: "in_progress",
      note: "The local session has started with the assigned team.",
    });
    await call(owner.token, "assessment_transition_order", {
      academy_id: academy,
      run_id: run.id,
      status: "delivered",
      note:
        "The reviewed learner report is available and concerns have been resolved.",
    });
    const supported = await call(owner.token, "assessment_support_plan", {
      academy_id: academy,
      candidate_id: candidate.id,
      assigned_to: teacher.id,
      goal: "Review writing structure with the learner and agree practice.",
      due_on: new Date(now + 86400000).toISOString(),
    });
    await call(teacher.token, "assessment_complete_support", {
      academy_id: academy,
      candidate_id: candidate.id,
      plan_id: (supported.plan as Record<string, unknown>).id,
      outcome: "Reviewed writing structure and agreed a focused practice plan.",
    });
    const certificate = await call(owner.token, "assessment_certificate", {
      academy_id: academy,
      candidate_id: candidate.id,
    });
    ok((certificate.result as Record<string, unknown>).public_token);
    learnerList = await call(learner.token, "assessment_student_list", {
      academy_id: academy,
    });
    const released =
      (learnerList.candidates as Array<Record<string, unknown>>)[0];
    ok(released.report);
    ok(released.summary);
    ok(!("review_notes" in released));
    ok(!("marks" in released));
    ok(Array.isArray(released.certificates));
    const privateResponse = await handleAcademyRequest(
      new Request(
        `${url}/functions/v1/academy?action=assessment_verify_certificate&token=${
          (released.certificates as Array<Record<string, unknown>>)[0]
            .public_token
        }`,
      ),
    );
    equal((await privateResponse.json()).status, "private");
    await call(learner.token, "assessment_student_certificate_consent", {
      academy_id: academy,
      candidate_id: candidate.id,
      consent: true,
    });
    const publicResponse = await handleAcademyRequest(
      new Request(
        `${url}/functions/v1/academy?action=assessment_verify_certificate&token=${
          (released.certificates as Array<Record<string, unknown>>)[0]
            .public_token
        }`,
      ),
    );
    const publicResult = await publicResponse.json();
    equal(publicResult.status, "verified");
    equal(publicResult.name, "Learner QA");
    ok(!("report" in publicResult));
    await call(learner.token, "assessment_student_appeal", {
      academy_id: academy,
      candidate_id: candidate.id,
      note: "Please check the writing task against its rubric once more.",
    });
    const withdrawn = await handleAcademyRequest(
      new Request(
        `${url}/functions/v1/academy?action=assessment_verify_certificate&token=${
          (released.certificates as Array<Record<string, unknown>>)[0]
            .public_token
        }`,
      ),
    );
    const withdrawnResult = await withdrawn.json();
    equal(withdrawnResult.status, "withdrawn");
    ok(!("name" in withdrawnResult));
  },
});

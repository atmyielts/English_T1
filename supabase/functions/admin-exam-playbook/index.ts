// Admin authoring API for the SAT and TOEFL playbooks: /admin-exam-playbook/<route>?exam=sat|toefl
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authorizeAdminRequest } from "../_shared/admin-access.ts";
import { type AdminDeps, createAdminExamPlaybookHandler } from "../_shared/admin-exam-playbook.ts";
import { corsHeaders, defaultLog } from "../_shared/exam-playbook.ts";

const env = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`Missing ${key}`);
  return value;
};

let deps: AdminDeps | null = null;
const makeDeps = (): AdminDeps => {
  if (deps) return deps;
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });
  deps = {
    db,
    authorize: async (req, exam) => {
      const result = await authorizeAdminRequest(db, req, corsHeaders, { action: `admin.exam_playbook.${exam}` });
      return result.ok
        ? { ok: true as const, context: { userId: result.context.userId, permissions: result.context.permissions, role: result.context.role } }
        : { ok: false as const, response: result.response };
    },
    now: () => new Date(),
    log: defaultLog("admin-exam-playbook"),
  };
  return deps;
};

serve(createAdminExamPlaybookHandler(makeDeps));

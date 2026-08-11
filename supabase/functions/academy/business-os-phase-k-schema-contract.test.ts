import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
const migration=await Deno.readTextFile(new URL("../../migrations/20260810240000_academy_direct_rls_scope_boundary.sql",import.meta.url));
Deno.test("Phase K prevents scoped grants from becoming academy-wide direct table access",()=>{
  for(const helper of ["academy_org_can_view","academy_org_can_manage","academy_crm_can_access","academy_finance_can_view","academy_payroll_can_view","academy_intelligence_can_access"]){assert(migration.includes(`function public.${helper}`),helper);}
  assert((migration.match(/g\.scope_type='academy'/g)??[]).length>=6);
});

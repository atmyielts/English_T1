import assert from "node:assert/strict";
const literal = (value) => "'" + String(value).replaceAll("'", "''") + "'";
/** Explicit PostgREST framing adapter, not a replacement repository or authority.
 * Actual handlers/repositories and service-role SQL enforce all business rules. */
export function browserDatabase(service, db) {
  const tables = new Set([
    "tenant_memberships",
    "assessment_item_banks",
    "assessment_item_versions",
    "assessment_item_keys",
    "assessment_rubrics",
    "assessment_definitions",
    "assessment_definition_revisions",
    "assessment_versions",
    "assessment_exam_windows",
    "assessment_join_links",
    "assessment_institution_profiles",
    "assessment_registrations",
    "assessment_attempts",
    "assessment_forms",
    "assessment_audit_events",
  ]);
  return {
    ...service,
    from(table) {
      assert.ok(tables.has(table));
      const filters = [];
      let limit = 1000, projection = "*";
      const query = {
        select(columns) {
          projection = columns;
          return query;
        },
        eq(name, value) {
          assert.ok(
            [
              "user_id",
              "status",
              "tenant_id",
              "id",
              "bank_id",
              "item_version_id",
              "candidate_id",
              "assessment_id",
              "window_id",
            ].includes(name),
          );
          filters.push(`${name}=${literal(value)}`);
          return query;
        },
        in(name, values) {
          assert.equal(name, "id");
          filters.push(
            `id=any(array[${values.map(literal).join(",")}]::uuid[])`,
          );
          return query;
        },
        limit(value) {
          assert.ok(Number.isSafeInteger(value) && value >= 1 && value <= 1000);
          limit = value;
          return query;
        },
        async maybeSingle() {
          const result = await query.limit(1);
          return { ...result, data: result.data?.[0] ?? null };
        },
        then(resolve, reject) {
          const relation = table === "tenant_memberships" &&
            projection.includes("tenants(name)");
          const row = relation
            ? "to_jsonb(r)||jsonb_build_object('tenants',jsonb_build_object('name','Connected QTI center'))"
            : "to_jsonb(r)";
          return db.query(
            `select coalesce(jsonb_agg(${row}),'[]') from(select * from public.${table}${
              filters.length ? " where " + filters.join(" and ") : ""
            } limit ${limit}) r;`,
          ).then(resolve, reject);
        },
      };
      return { select: query.select };
    },
  };
}

import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
export function testDatabase(container,transport) {
  assert.match(container, /^schood-media-browser-[a-f0-9]{8}$/);
  function docker(args, input) {
    const result = spawnSync("docker", args, {
      input,
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      timeout: 60000,
    });
    if (result.status !== 0)
      throw new Error(result.stderr || String(result.error));
    return result.stdout.trim();
  }
  const literal = (value) => {
    const encoded = typeof value === "string" ? value : JSON.stringify(value);
    let delimiter;
    do {
      delimiter = `$s_${randomUUID().replaceAll("-", "")}$`;
    } while (encoded.includes(delimiter));
    return `${delimiter}${encoded}${delimiter}`;
  };
  const sql = (query) =>
    docker(
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        "postgres",
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      query,
    );
  function execute(query) {
    if(transport)return transport.query(query);
    return new Promise((resolve, reject) => {
      const child = spawn(
        "docker",
        [
          "exec",
          "-i",
          container,
          "psql",
          "-U",
          "postgres",
          "-At",
          "-v",
          "ON_ERROR_STOP=1",
          "-v",
          "VERBOSITY=verbose",
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
      );
      let output = "",
        error = "";
      child.stdout.on("data", (chunk) => (output += chunk));
      child.stderr.on("data", (chunk) => (error += chunk));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          const match = /ERROR:\s+([A-Z0-9]{5}):\s+([^\r\n]+)/.exec(error);
          resolve({
            data: null,
            error: {
              code: match?.[1],
              message: match?.[2] ?? "Local database operation failed",
            },
          });
          return;
        }
        try {
          resolve({
            data: JSON.parse(output.trim().split("\n").at(-1)),
            error: null,
          });
        } catch (cause) {
          reject(cause);
        }
      });
      child.stdin.end(`set role service_role;${query}`);
    });
  }
  const service = {
    rpc(name, args) {
      assert.match(
        name,
        /^assessment_(workspaces|command(_live_gate)?|has_capability|artifact_(read|command|transport|scan_claim|scan_bundle|scan_report)|runtime_(snapshot|command|expire|schedule_claim|schedule_reconcile)|grading_(read|command|claim|bundle|receipt|commit)|appeal_(read|command)|certificate_(read|command|seal|status)|(answer|feedback)_(read|command))$/,
      );
      const values = Object.entries(args).map(([key, value]) => {
        assert.match(key, /^p_[a-z_]+$/);
        return `${key}=>${value === null ? "null" : literal(value)}${["p_data", "p_report"].includes(key) ? "::jsonb" : ""}`;
      });
      return execute(
        `select coalesce(to_jsonb(public.${name}(${values.join(",")})),'null'::jsonb);`,
      );
    },
    from(table) {
      assert.ok(
        [
          "tenant_memberships",
          "assessment_item_banks",
          "assessment_item_versions",
          "assessment_items",
          "assessment_item_keys",
          "assessment_item_review_comments",
          "assessment_join_links",
          "assessment_institution_profiles",
          "assessment_rubrics",
          "assessment_definitions",
          "assessment_definition_revisions",
          "assessment_versions",
          "assessment_exam_windows",
          "assessment_registrations",
          "assessment_attempts",
          "assessment_forms",
          "assessment_response_journal",
          "assessment_audit_events",
        ].includes(table),
      );
      return {
        select(columns) {
          const filters = [];
          let maximum = 1000;
          const query = {
            eq(name, value) {
              assert.match(name, /^[a-z_]+$/);
              filters.push(`${name}=${literal(value)}`);
              return query;
            },
            in(name, values) {
              assert.match(name, /^[a-z_]+$/);
              filters.push(
                values.length
                  ? `${name} in (${values.map(literal).join(",")})`
                  : "false",
              );
              return query;
            },
            limit(count) {
              assert.ok(Number.isInteger(count) && count > 0 && count <= 1000);
              maximum = count;
              return query;
            },
            async maybeSingle() {
              const result = await read();
              if (result.error) return result;
              if (result.data.length > 1)
                return {
                  data: null,
                  error: {
                    code: "PGRST116",
                    message: "Local maybeSingle returned multiple rows",
                  },
                };
              return { data: result.data[0] ?? null, error: null };
            },
            then(resolve, reject) {
              return read().then(resolve, reject);
            },
          };
          function read() {
            let selection = columns;
            if (
              table === "tenant_memberships" &&
              columns === "tenant_id,role,tenants(name)"
            )
              selection =
                "tenant_id,role,jsonb_build_object('name','Connected media center') as tenants";
            else assert.match(columns, /^(\*|[a-z_]+(?:,[a-z_]+)*)$/);
            return execute(
              `select coalesce(jsonb_agg(row),'[]'::jsonb) from(select ${selection} from public.${table}${filters.length ? " where " + filters.join(" and ") : ""} limit ${maximum}) row;`,
            );
          }
          return query;
        },
      };
    },
  };
  return { docker, sql, literal, service };
}

// Test-only PostgREST port: persistent service-role psql sessions, real PG
// statements/transactions/constraints. No host database port or provider secrets.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const literal = (value) => "'" + value.replaceAll("'", "''") + "'";
export async function fixtureDatabase(container, initialize) {
  assert.match(container, /^schood-(appeals|media)-browser-[a-f0-9]{8}$/);
  initialize(
    `create function public.fixture_query(p_token text,p_sql text) returns jsonb language plpgsql as $$declare value jsonb;begin execute p_sql into value;set constraints all immediate;return jsonb_build_object('bridge_id',p_token,'data',value,'error',null);exception when others then return jsonb_build_object('bridge_id',p_token,'data',null,'error',jsonb_build_object('code',SQLSTATE,'message',SQLERRM));end;$$;revoke all on function public.fixture_query(text,text) from public;grant execute on function public.fixture_query(text,text) to service_role;`,
  );
  const channels = [];
  let next = 0, closed = false;
  try {
    for (let n = 0; n < 4; n++) {
      const child = spawn("docker", [
          "exec",
          "-i",
          container,
          "psql",
          "-U",
          "postgres",
          "-qAt",
        ], { stdio: ["pipe", "pipe", "pipe"] }),
        pending = new Map();
      let buffer = "", stderr = "";
      const fail = (cause) => {
        for (const entry of pending.values()) {
          clearTimeout(entry.timer);
          entry.reject(cause);
        }
        pending.clear();
      };
      child.stdout.setEncoding("utf8");
      child.stderr.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        buffer += chunk;
        if (buffer.length > 32_000_000) {
          fail(
            new Error("Fixture response exceeds its bounded adapter buffer"),
          );
          child.kill();
          return;
        }
        let end;
        while ((end = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, end).trim();
          buffer = buffer.slice(end + 1);
          if (!line) continue;
          try {
            const value = JSON.parse(line),
              entry = pending.get(value.bridge_id);
            if (!entry) continue;
            pending.delete(value.bridge_id);
            clearTimeout(entry.timer);
            entry.resolve({ data: value.data, error: value.error });
          } catch {
            fail(new Error("Invalid fixture database framing"));
          }
        }
      });
      child.stderr.on("data", (chunk) => {
        stderr = (stderr + chunk).slice(-16000);
      });
      child.on("error", fail);
      child.on(
        "close",
        (code) =>
          fail(
            new Error(
              "Fixture database channel closed (" + code + "): " + stderr,
            ),
          ),
      );
      child.stdin.on("error", fail);
      child.stdin.write("set role service_role;\n");
      const query = (sql) =>
        new Promise((resolve, reject) => {
          if (closed) {
            reject(new Error("Fixture database is closed"));
            return;
          }
          const token = randomUUID(),
            timer = setTimeout(() => {
              pending.delete(token);
              reject(new Error("Fixture database statement timed out"));
            }, 60000);
          pending.set(token, { resolve, reject, timer });
          child.stdin.write(
            `select public.fixture_query(${literal(token)},${literal(sql)});\n`,
          );
        });
      channels.push({ child, query, fail });
      const probe = await query("select to_jsonb(1);");
      if (probe.error || probe.data !== 1) {
        throw new Error(
          "Fixture database channel failed its service-role probe: " +
            JSON.stringify(probe.error),
        );
      }
    }
  } catch (cause) {
    closed = true;
    for (const channel of channels) {
      channel.fail(cause);
      channel.child.kill();
    }
    throw cause;
  }
  return {
    query(sql) {
      return channels[next++ % channels.length].query(sql);
    },
    close() {
      closed = true;
      for (const channel of channels) {
        channel.fail(new Error("Fixture database disposed"));
        channel.child.stdin.end("\\q\n");
        channel.child.kill();
      }
    },
  };
}

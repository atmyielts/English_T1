import { request } from "./client";
import { ResponseJournal } from "./journal";
import { GradeCommands } from "./grade-command";
import { acknowledgeCommittedDraft } from "./draft-store";
/** Actor/tenant-scoped encrypted intent. API authority is still rechecked for every replay. */
export async function openAuthorCommands(
  tenant: string,
  actor: string,
  workspace?: "assessment-design",
) {
  if (!navigator.locks)
    throw new Error(
      "Use a browser with secure workspace locking to save authoring changes.",
    );
  const scope = `authoring:${tenant}:${actor}${workspace ? ":" + workspace : ""}`,
    journal = await ResponseJournal.create(scope);
  const locking = async <T>(work: () => Promise<T>): Promise<T> =>
    await navigator.locks.request(`schood-authoring-commands:${scope}`, work);
  const commands = new GradeCommands(
    {
      async pending() {
        const rows = await journal.pending();
        if (!rows.length) return null;
        const value = rows[0].response as {
          action: string;
          data: Record<string, unknown>;
        };
        return { ...value, key: rows[0].command_key };
      },
      async save(action, data) {
        const entry = await journal.append(1, "authoring-command", {
          action,
          data,
        });
        return { action, data, key: entry.command_key };
      },
      acknowledge: () => journal.acknowledge(1),
    },
    async (intent) => {
      const { _draft, ...data } = intent.data;
      const result = await request<Record<string, unknown>>(
          "commands",
          tenant,
          { action: intent.action, data },
          ["assessment.revise", "assessment.publish"].includes(intent.action)
            ? Number(data.revision)
            : undefined,
          intent.key,
          actor,
        ),
        cleared = await acknowledgeCommittedDraft(_draft, tenant, actor);
      return { ...result, device_draft_preserved: !cleared };
    },
    locking,
    "authoring",
  );
  return { commands, close: () => journal.close() };
}

import { type FormEvent, useState } from "react";
import type {
  Cohort,
  DirectoryMember,
} from "../../../../packages/assessment-web/src/cohorts";
import { useAppT, useCodeText } from "../i18n/index.ts";
export function CohortEditor({
  group,
  directory,
  disabled,
  search,
  send,
}: {
  group: Cohort;
  directory: DirectoryMember[];
  disabled: boolean;
  search: (query: string) => Promise<void>;
  send: (
    action: string,
    data: Record<string, unknown>,
  ) => Promise<Record<string, unknown> | null>;
}) {
  const t = useAppT(), codeText = useCodeText();
  const [title, setTitle] = useState(group.title),
    [description, setDescription] = useState(group.description),
    [reason, setReason] = useState(""),
    [user, setUser] = useState(""),
    [extra, setExtra] = useState("0"),
    [query, setQuery] = useState("");
  async function revise(event: FormEvent) {
    event.preventDefault();
    await send("cohort.revise", {
      cohort_id: group.id,
      expected_revision: group.revision,
      title,
      description,
      state: group.state,
      reason,
    });
  }
  return (
    <section>
      <h2>{group.title}</h2>
      <p>
        {t("cohort.summary", { state: codeText("cohort.state", group.state), revision: String(group.revision) })}
      </p>
      <form onSubmit={(event) => void revise(event)}>
        <label>
          {t("cohort.title")}<input
            required
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={disabled}
          />
        </label>
        <label>
          {t("cohort.description")}<textarea
            maxLength={2000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={disabled}
          />
        </label>
        <label>
          {t("cohort.reason")}<textarea
            required
            maxLength={2000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={disabled}
          />
        </label>
        <div className="cohort-actions">
          <button disabled={disabled || !reason.trim()}>
            {t("cohort.save")}
          </button>
          <button
            type="button"
            className="quiet"
            disabled={disabled || !reason.trim()}
            onClick={() =>
              void send("cohort.revise", {
                cohort_id: group.id,
                expected_revision: group.revision,
                title: group.title,
                description: group.description,
                state: group.state === "active" ? "archived" : "active",
                reason,
              })}
          >
            {group.state === "active" ? t("cohort.archive") : t("cohort.reactivate")}
          </button>
        </div>
      </form>
      <h3>{t("cohort.members")}</h3>
      <ul className="records">
        {group.members?.map((member) => (
          <li key={member.id}>
            <strong>{member.name}</strong>
            <span>{t("cohort.extraSeconds", { count: member.extra_seconds, seconds: String(member.extra_seconds) })}</span>
            <button
              className="quiet"
              disabled={disabled || group.state !== "active" || !reason.trim()}
              onClick={() =>
                void send("member.remove", {
                  cohort_id: group.id,
                  user_id: member.id,
                  expected_revision: group.revision,
                  reason,
                })}
            >
              {t("cohort.removeMember", { name: member.name })}
            </button>
          </li>
        ))}
      </ul>
      {group.state === "active" && (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void search(query);
            }}
          >
            <label>
              {t("cohort.search")}<input
                type="search"
                maxLength={200}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setUser("");
                }}
                disabled={disabled}
              />
            </label>
            <button className="quiet" disabled={disabled}>
              {t("cohort.searchSubmit")}
            </button>
          </form>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void send("member.add", {
                cohort_id: group.id,
                user_id: user,
                expected_revision: group.revision,
                extra_seconds: Number(extra),
                reason,
              });
            }}
          >
            <label>
              {t("cohort.member")}<select
                required
                value={user}
                onChange={(event) => setUser(event.target.value)}
                disabled={disabled}
              >
                <option value="">{t("cohort.chooseMember")}</option>
                {directory.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("cohort.extra")}<input
                type="number"
                min={0}
                max={86400}
                step={1}
                required
                value={extra}
                onChange={(event) => setExtra(event.target.value)}
                disabled={disabled}
              />
            </label>
            <button disabled={disabled || !user || !reason.trim()}>
              {t("cohort.addMember")}
            </button>
          </form>
        </>
      )}
    </section>
  );
}

import { useEffect, useRef, useState } from "react";
import {
  request,
  ServiceRequestError,
} from "../../../../packages/assessment-web/src/client";
import {
  openStaffCommands,
  staffProblem as staffProblemText,
  type StaffAccess,
  type StaffDetail,
  type StaffMember,
  type StaffRole,
} from "../../../../packages/assessment-web/src/staff";
import type { GradeIntent } from "../../../../packages/assessment-web/src/grade-command";
import { RoleEditor } from "./RoleEditor";
import { MemberPermissions } from "./MemberPermissions";
import { InvitationsWorkspace } from './InvitationsWorkspace';
import "./staff.css";
import { useAppT } from "../i18n/index.ts";
export function StaffWorkspace({
  tenant,
  actor,
}: {
  tenant: string;
  actor: string;
}) {
  const t = useAppT(),
    staffProblem = (cause: unknown) => staffProblemText(cause, t);
  const [access, setAccess] = useState<StaffAccess | null>(null),
    [members, setMembers] = useState<StaffMember[]>([]),
    [roles, setRoles] = useState<StaffRole[]>([]),
    [detail, setDetail] = useState<StaffDetail | null>(null),
    [member, setMember] = useState<StaffMember | null>(null),
    [editing, setEditing] = useState<StaffRole | "new" | null>(null),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [pending, setPending] = useState<GradeIntent | null>(null),
    [memberMore, setMemberMore] = useState(false),
    [roleMore, setRoleMore] = useState(false);
  const alive = useRef(true),
    version = useRef(0),
    reading = useRef(0),
    engine = useRef<Awaited<ReturnType<typeof openStaffCommands>> | null>(null),
    selected = useRef<string | null>(null);
  const get = <T,>(path: string) =>
    request<T>(`staff/${path}`, tenant, undefined, undefined, undefined, actor);
  function deny(){reading.current++;selected.current=null;setAccess({can_manage:false,bootstrap:false,delegable:[],authority_ends_at:{}});setMembers([]);setRoles([]);setMember(null);setDetail(null);setEditing(null);setMemberMore(false);setRoleMore(false);}
  async function load() {
    const seq = ++version.current;
    try {
      const current = await get<StaffAccess>("access");
      if (!alive.current || version.current !== seq) return null;
      setAccess(current);
      if (!current.can_manage) {
        deny();return null;
      }
      const [people, definitions] = await Promise.all([
        get<StaffMember[]>("members?limit=100"),
        get<StaffRole[]>("roles?limit=100"),
      ]);
      if (alive.current && seq === version.current) {
        setMembers(people);
        setRoles(definitions);
        setMemberMore(people.length === 100);
        setRoleMore(definitions.length === 100);
        return people;
      }
    } catch (cause) {
      if (alive.current && seq === version.current) {
        if (
          cause instanceof ServiceRequestError &&
          [401, 403].includes(cause.status)
        ) {
          deny();
        }
        setError(staffProblem(cause));
      }
    }
    return null;
  }
  async function refresh(){const people=await load();const current=people?.find(row=>row.id===selected.current);if(current)await open(current);}
  async function open(person: StaffMember) {
    const seq = ++reading.current;
    selected.current = person.id;
    setMember(null);
    setDetail(null);
    setError("");
    try {
      const value = await get<StaffDetail>(`members/${person.id}`);
      if (alive.current && seq === reading.current) {
        setMember(person);
        setDetail(value);
      }
    } catch (cause) {
      if (alive.current && seq === reading.current){
        if(cause instanceof ServiceRequestError&&[401,403].includes(cause.status))deny();
        setError(staffProblem(cause));
      }
    }
  }
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    void load();
    void openStaffCommands(tenant, actor)
      .then(async (value) => {
        if (cancelled) {
          value.close();
          return;
        }
        engine.current = value;
        const saved = await value.commands.pending();
        if (!cancelled) {
          setPending(saved);
          setReady(true);
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(staffProblem(cause));
      });
    return () => {
      cancelled = true;
      alive.current = false;
      version.current++;
      reading.current++;
      engine.current?.close();
      engine.current = null;
    };
  }, [tenant, actor]);
  async function mutate(action?: string, data?: Record<string, unknown>) {
    if (busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    let committed = false;
    try {
      const active = engine.current;
      if (!active)
        throw new Error(t("staff.queueNotReady"));
      if (action) await active.commands.execute(action, data!);
      else await active.commands.retry();
      committed = true;
      if (!alive.current) return true;
      setNotice(t("staff.recorded"));
      await refresh();
      return true;
    } catch (cause) {
      if (alive.current) {
        if (cause instanceof ServiceRequestError && [401,403].includes(cause.status)) deny();
        setError(staffProblem(cause));
        if (committed)
          setNotice(t("staff.recordedRefresh"));
      }
      return committed;
    } finally {
      if (alive.current) {
        try {
          setPending((await engine.current?.commands.pending()) ?? null);
        } catch (cause) {
          setError(staffProblem(cause));
        }
        setBusy(false);
      }
    }
  }
  async function more(kind: "members" | "roles") {
    const list = kind === "members" ? members : roles,
      last = list.at(-1)?.id;
    if (!last) return;
    setBusy(true);
    try {
      const result = await get<StaffMember[] | StaffRole[]>(
        `${kind}?limit=100&after=${last}`,
      );
      if (!alive.current) return;
      if (kind === "members") {
        setMembers((current) => [...current, ...(result as StaffMember[])]);
        setMemberMore(result.length === 100);
      } else {
        setRoles((current) => [...current, ...(result as StaffRole[])]);
        setRoleMore(result.length === 100);
      }
    } catch (cause) {
      if (alive.current) setError(staffProblem(cause));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  const locked = busy || !ready || !!pending;
  return (
    <div className="staff-workspace">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {pending && (
        <section>
          <h2>{t("staff.pendingTitle")}</h2>
          <p>
            {t("staff.pendingBody")}
          </p>
          <button disabled={busy} onClick={() => void mutate()}>
            {t("staff.retry")}
          </button>
        </section>
      )}
      {!access ? (
        <p role="status">{t("staff.loading")}</p>
      ) : !access.can_manage ? (
        <p>
          {t("staff.cannotManage")}
        </p>
      ) : (
        <div className="staff-layout">
          <section>
            <h2>{t("staff.members")}</h2>
            <p>
              {t("staff.membersLead")}
            </p>
            <ul className="records">
              {members.map((person) => (
                <li key={person.id}>
                  <strong>{person.name}</strong>
                  <span>
                    {t("staff.memberMeta", { status: person.status, role: String(person.org_role) })}
                  </span>
                  <button
                    className="quiet"
                    disabled={locked}
                    onClick={() => void open(person)}
                  >
                    {t("staff.review")}
                  </button>
                </li>
              ))}
            </ul>
            {memberMore && (
              <button disabled={locked} onClick={() => void more("members")}>
                {t("staff.moreMembers")}
              </button>
            )}
            <button
              className="quiet"
              disabled={locked}
              onClick={() => void refresh()}
            >
              {t("staff.refresh")}
            </button>
            <h3>{t("staff.roles")}</h3>
            <ul className="records">
              {roles.map((role) => (
                <li key={role.id}>
                  <strong>
                    {t("staff.roleTitle", { title: role.title, version: String(role.version) })}
                  </strong>
                  <button
                    className="quiet"
                    disabled={
                      locked ||
                      !role.capabilities.every((cap) =>
                        access.delegable.includes(cap),
                      )
                    }
                    onClick={() => setEditing(role)}
                  >
                    {t("staff.revise")}
                  </button>
                </li>
              ))}
            </ul>
            {roleMore && (
              <button disabled={locked} onClick={() => void more("roles")}>
                {t("staff.moreRoles")}
              </button>
            )}
            <button disabled={locked} onClick={() => setEditing("new")}>
              {t("staff.createRole")}
            </button>
          </section>
          <div className="staff-forms">
            {editing && (
              <RoleEditor
                key={editing === "new" ? "new" : editing.id}
                access={access}
                role={editing === "new" ? undefined : editing}
                busy={locked}
                submit={mutate}
                cancel={() => setEditing(null)}
              />
            )}{" "}
            {member && detail && (
              <MemberPermissions
                key={JSON.stringify(detail)}
                member={member}
                detail={detail}
                roles={roles}
                access={access}
                actor={actor}
                busy={locked}
                submit={mutate}
              />
            )}{" "}
            {!editing && !detail && (
              <section>
                <h2>{t("staff.selectTitle")}</h2>
                <p>
                  {t("staff.selectLead")}
                </p>
              </section>
            )}
          </div>
        </div>
      )}
      {access?.can_manage && import.meta.env.VITE_ASSESSMENT_INVITATIONS_ENABLED === 'true' && <InvitationsWorkspace key={`${actor}:${tenant}`} tenant={tenant} actor={actor} roles={roles} access={access}/>}
    </div>
  );
}

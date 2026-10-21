import React, {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createRoot } from "react-dom/client";
import { configured, request, supabase, observeAccount, type Row } from "./client";
import { ServiceHeader } from "../../../packages/service-design/src/ServiceHeader";
import { type Definition } from "../../../packages/assessment-core/src/mod.ts";
import {invitationFromFragment,type InvitationLink} from '../../../packages/assessment-web/src/invitations';
import {AcceptInvitation} from './staff/AcceptInvitation';
import "./style.css";
const AssessmentWorkspace = lazy(() =>
  import("./design/AssessmentWorkspace").then((module) => ({
    default: module.AssessmentWorkspace,
  })),
);
const GradingWorkspace = lazy(() =>
  import("./grading/GradingWorkspace").then((module) => ({
    default: module.GradingWorkspace,
  })),
);
const ItemWorkspace = lazy(() =>
  import("./authoring/ItemWorkspace").then((module) => ({
    default: module.ItemWorkspace,
  })),
);
const StaffWorkspace = lazy(() =>
  import("./staff/StaffWorkspace").then((module) => ({
    default: module.StaffWorkspace,
  })),
);
const MediaWorkspace = lazy(() => import("./media/MediaWorkspace").then(module=>({default:module.MediaWorkspace})));
const AppealsWorkspace = lazy(() => import("./appeals/AppealsWorkspace").then(module=>({default:module.AppealsWorkspace})));
const CertificatesWorkspace = lazy(() => import("./certificates/CertificatesWorkspace").then(module=>({default:module.CertificatesWorkspace})));
const CohortsWorkspace = lazy(() => import("./cohorts/CohortsWorkspace").then(module=>({default:module.CohortsWorkspace})));
const BankImportWorkspace = lazy(() => import("./imports/BankImportWorkspace").then(module=>({default:module.BankImportWorkspace})));
const AnalyticsWorkspace = lazy(() => import("./analytics/AnalyticsWorkspace").then(module=>({default:module.AnalyticsWorkspace})));
const FeedbackWorkspace = lazy(() => import("./feedback/FeedbackWorkspace").then(module=>({default:module.FeedbackWorkspace})));
import type { GradeAccess } from "../../../packages/assessment-web/src/grading";

type Tab = "banks" | "items" | "media" | "assessments" | "windows" | "grading" | "staff" | "appeals" | "certificates" | "cohorts" | "imports" | "analytics" | "feedback";
const labels: Record<Tab, string> = {
  banks: "Question banks",
  imports: "Import & export",
  analytics: "Results & analytics",
  feedback: "Result feedback",
  items: "Questions & review",
  media: "Media library",
  assessments: "Assessments",
  windows: "Exam sittings",
  cohorts: "Cohorts & registration",
  grading: "Grading & results",
  appeals: "Result appeals",
  certificates: "Certificates",
  staff: "Staff & permissions",
};
function availableTabs(access: GradeAccess): Tab[] {
  return [
    ...(access.can_read_banks
      ? (["banks", "items", "media", "assessments"] as Tab[])
      : []),
    ...(access.can_manage_exams ? (["windows"] as Tab[]) : []),
    ...(access.can_read_banks && access.can_write_items ? (["imports"] as Tab[]) : []),
    ...(access.can_manage_exams ? (["cohorts"] as Tab[]) : []),
    ...(access.can_manage_team ? (["staff"] as Tab[]) : []),
    ...(access.can_mark || access.can_moderate || access.can_release
      ? (["grading"] as Tab[])
      : []),
    ...(access.can_moderate ? (["appeals"] as Tab[]) : []),
    ...(access.can_manage_certificates ? (["certificates"] as Tab[]) : []),
    ...(access.can_read_analytics ? (["analytics"] as Tab[]) : []),
    ...(access.can_release ? (["feedback"] as Tab[]) : []),
  ];
}
function App() {
  const invitationEnabled=import.meta.env.VITE_ASSESSMENT_INVITATIONS_ENABLED==='true';
  const readInvitation=():{link:InvitationLink|null;error:string}=>{try{return{link:invitationEnabled?invitationFromFragment():null,error:''};}catch(cause){return{link:null,error:(cause as Error).message};}};
  const [invitation,setInvitation]=useState(readInvitation),[invitationRefresh,setInvitationRefresh]=useState(0);
  useEffect(()=>{const change=()=>setInvitation(readInvitation());window.addEventListener('hashchange',change);return()=>window.removeEventListener('hashchange',change);},[]);
  function finishInvitation(){history.replaceState(null,'',location.pathname+location.search);setInvitation({link:null,error:''});setInvitationRefresh(value=>value+1);}
  const [user, setUser] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState("");
  const signedIn = Boolean(user);
  const [workspaces, setWorkspaces] = useState<Row[]>([]),
    [tenant, setTenant] = useState(""),
    [tab, setTab] = useState<Tab>("banks");
  const [rows, setRows] = useState<Record<string, Row[]>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [title, setTitle] = useState("");
  const [selectedVersion, setSelectedVersion] = useState(""),
    [opens, setOpens] = useState(""),
    [closes, setCloses] = useState(""),
    [windowId, setWindowId] = useState(""),
    [candidate, setCandidate] = useState("");
  const [permissions, setPermissions] = useState<{
      scope: string;
      access: GradeAccess;
    } | null>(null),
    [workspaceOwner, setWorkspaceOwner] = useState(""),
    [gradeRefresh, setGradeRefresh] = useState(0);
  const scope = `${user}:${tenant}`,
    liveScope = useRef(scope),
    liveUser = useRef(user),
    loadVersion = useRef(0);
  liveScope.current = scope;
  liveUser.current = user;
  const access = permissions?.scope === scope ? permissions.access : null;
  useEffect(() => {
    return observeAccount(setUser);
  }, []);
  useEffect(() => {
    let active = true;
    setBusy(false);
    setError("");
    setNotice("");
    setWorkspaces([]);
    setWorkspaceOwner("");
    setTenant("");
    setPermissions(null);
    setRows({});
    if (user)
      request<Row[]>(
        "workspaces",
        undefined,
        undefined,
        undefined,
        undefined,
        user,
      )
        .then((data) => {
          if (active && liveUser.current === user) {
            setWorkspaces(data);
            setWorkspaceOwner(user);
            setTenant(String(data[0]?.tenant_id ?? ""));
          }
        })
        .catch((cause) => {
          if (active) setError(cause.message);
        });
    return () => {
      active = false;
    };
  }, [user,invitationRefresh]);
  async function load() {
    if (!tenant || !user) return;
    const expected = scope,
      version = ++loadVersion.current;
    const clearDenied=(cause:unknown)=>{const lostSession=cause instanceof Error&&['Sign in to continue.','The signed-in account changed. Reopen this workspace.'].includes(cause.message);if(liveScope.current===expected&&version===loadVersion.current&&(lostSession||[401,403].includes((cause as {status?:number})?.status??0))){setRows({});setPermissions(null);}};
    try {
    const current = await request<GradeAccess>(
      "grading/access",
      tenant,
      undefined,
      undefined,
      undefined,
      user,
    );
    if (liveScope.current !== expected || version !== loadVersion.current)
      return;
    setPermissions({ scope: expected, access: current });
    const tabs = availableTabs(current);
    if (!tabs.includes(tab) && tabs.length) setTab(tabs[0]);
    const resources = [
      ...(current.can_read_banks
        ? [
            "item-banks",
            "item-versions",
            "rubrics",
            "assessments",
            "assessment-versions",
          ]
        : []),
      ...(current.can_manage_exams ? ["exam-windows", "registrations"] : []),
    ];
    // Keep confirmed records through a network-only refresh failure, but drop
    // resources immediately when freshly checked permissions no longer allow them.
    const allowedResources=new Set(resources);
    setRows(previous=>Object.fromEntries(Object.entries(previous).filter(([resource])=>allowedResources.has(resource))));
    const results = await Promise.all(
      resources.map(
        async (resource) =>
          [
            resource,
            await request<Row[]>(
              resource,
              tenant,
              undefined,
              undefined,
              undefined,
              user,
            ).catch(cause=>{clearDenied(cause);throw cause;}),
          ] as const,
      ),
    );
    if (liveScope.current === expected && version === loadVersion.current)
      setRows(Object.fromEntries(results));
    } catch(cause) {
      clearDenied(cause);
      throw cause;
    }
  }
  useEffect(() => {
    setBusy(false);
    setNotice("");
    setRows({});
    setSelectedVersion("");
    setWindowId("");
    setError("");
    setTitle("");
    const expected = scope;
    load().catch((cause) => {
      if (liveScope.current === expected) setError(cause.message);
    });
    return () => {
      loadVersion.current++;
    };
  }, [tenant, user]);
  async function run(work: () => Promise<void>) {
    const expected = scope;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      if (liveScope.current === expected) await load();
    } catch (cause) {
      if (liveScope.current === expected)
        setError(
          cause instanceof Error
            ? cause.message
            : "Could not complete this action.",
        );
    } finally {
      if (liveScope.current === expected) setBusy(false);
    }
  }
  async function command(action: string, data: unknown, revision?: number) {
    const expected = scope,
      result = await request<Row>(
        "commands",
        tenant,
        { action, data },
        revision,
        undefined,
        user,
      );
    if (liveScope.current !== expected)
      throw new Error("The workspace changed.");
    return result;
  }
  const prevent = (fn: () => Promise<void>) => (event: FormEvent) => {
    event.preventDefault();
    void run(fn);
  };
  if (!configured)
    return (
      <main className="configuration">
        <h1>Assessment Cloud</h1>
        <p>
          The service connection has not been configured. Set the public
          Supabase URL and anonymous key before starting this application.
        </p>
      </main>
    );
  if (!signedIn)
    return (
      <main className="signin">
        <div className="brand">
          Schood <span>Assessment Cloud</span>
        </div>
        <h1>Your institution’s assessment workspace</h1>
        <p>
          Create question banks, publish reviewed tests and schedule candidates.
        </p>
        {invitation.link&&<p>Sign in with the invitation recipient’s verified Schood email to review their Assessment role. If you do not have an account, complete the normal Schood account setup first, then reopen this link.</p>}
        {invitation.error&&<p role="alert" className="error">{invitation.error}</p>}
        <form
          onSubmit={prevent(async () => {
            const { error } = await supabase!.auth.signInWithPassword({
              email,
              password,
            });
            if (error) throw error;
          })}
        >
          <label>
            Email
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button disabled={busy}>Sign in</button>
        </form>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </main>
    );
  if(invitation.link)return <AcceptInvitation key={`${user}:${invitation.link.tenant}:${invitation.link.id}`} actor={user} link={invitation.link} done={finishInvitation}/>;
  if(invitation.error)return <main className="signin"><h1>Invitation link unavailable</h1><p role="alert">{invitation.error}</p><button onClick={finishInvitation}>Continue to Assessment Cloud</button></main>;
  return (
    <div className="workspace">
      <ServiceHeader
        service="Assessment Cloud"
        nav={(access ? availableTabs(access) : []).map((value) => ({
          id: value,
          label: labels[value],
          active: tab === value,
          onClick: () => {
            setTab(value);
            setTitle("");
          },
        }))}
      >
        <label className="tenant">
          Institution
          <select
            aria-label="Institution"
            value={tenant}
            onChange={(event) => setTenant(event.target.value)}
          >
            {(workspaceOwner === user ? workspaces : []).map((workspace) => (
              <option
                key={String(workspace.tenant_id)}
                value={String(workspace.tenant_id)}
              >
                {String(
                  (workspace.tenants as Row)?.name ?? workspace.tenant_id,
                )}
              </option>
            ))}
          </select>
        </label>
        <button className="quiet" onClick={() => void supabase!.auth.signOut()}>
          Sign out
        </button>
      </ServiceHeader>
      <main id="workspace-main" tabIndex={-1}>
        <div className="page-heading">
          <div>
            <p className="eyebrow">Institution workspace</p>
            <h1>{access ? labels[tab] : "Your institution workspace"}</h1>
          </div>
          <button
            className="quiet"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await load();
                setGradeRefresh((value) => value + 1);
              })
            }
          >
            Refresh
          </button>
        </div>
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
        {!tenant ? (
          <p>Join or create an institution through Schood to begin.</p>
        ) : !access ? (
          <p role="status">Loading your institution permissions…</p>
        ) : !availableTabs(access).length ? (
          <p>No assessment permissions have been assigned to this account.</p>
        ) : (
          <Suspense
            fallback={<p role="status">Loading institution workspace…</p>}
          >
            <div
              className={
                tab === "grading" ||
                tab === "items" ||
                tab === "media" ||
                tab === "staff" ||
                tab === "appeals" ||
                tab === "certificates" ||
                tab === "cohorts" ||
                tab === "imports" ||
                tab === "analytics" ||
                tab === "feedback" ||
                tab === "assessments"
                  ? "grading-container"
                  : "split"
              }
            >
              {tab === "grading" && (
                <GradingWorkspace
                  key={scope}
                  tenant={tenant}
                  actor={user}
                  initialAccess={access}
                  refreshVersion={gradeRefresh}
                />
              )}
              {tab === "staff" && (
                <StaffWorkspace key={scope} tenant={tenant} actor={user} />
              )}
              {tab === "appeals" && <AppealsWorkspace key={scope} tenant={tenant} actor={user}/>}
              {tab === "certificates" && <CertificatesWorkspace key={scope} tenant={tenant} actor={user}/>}
              {tab === "cohorts" && <CohortsWorkspace key={scope} tenant={tenant} actor={user}/>}
              {tab === "analytics" && <AnalyticsWorkspace key={scope} tenant={tenant} actor={user}/>}
              {tab === "feedback" && <FeedbackWorkspace key={scope} tenant={tenant} actor={user}/>}
              {tab === "imports" && <BankImportWorkspace key={scope} tenant={tenant} actor={user} banks={rows['item-banks']??[]} reviewDrafts={()=>void run(async()=>{await load();if(liveScope.current===scope)setTab('items');})}/>}
              {tab === "media" && <MediaWorkspace key={scope} tenant={tenant} actor={user} canUpload={access.can_write_items}/>}
              {tab === "banks" && (
                <>
                  <section>
                    <h2>Institution libraries</h2>
                    <p>
                      Questions are versioned independently. Published tests
                      keep the exact version their author selected.
                    </p>
                    <ul className="records">
                      {(rows["item-banks"] ?? []).map((row) => (
                        <li key={row.id}>
                          <strong>{String(row.title)}</strong>
                          <span>{row.id}</span>
                        </li>
                      ))}
                    </ul>
                    {!rows["item-banks"]?.length && (
                      <p>
                        Create your first bank for a subject or placement
                        program.
                      </p>
                    )}
                  </section>
                  {access.can_write_items && (
                    <section className="editor">
                      <h2>Create a bank</h2>
                      <form
                        onSubmit={prevent(async () => {
                          await command("bank.create", { title });
                          setTitle("");
                          setNotice("Question bank created.");
                        })}
                      >
                        <label>
                          Bank name
                          <input
                            required
                            maxLength={200}
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                          />
                        </label>
                        <button disabled={busy}>Create bank</button>
                      </form>
                    </section>
                  )}
                </>
              )}
              {tab === "items" && (
                <ItemWorkspace
                  key={scope}
                  tenant={tenant}
                  actor={user}
                  access={access}
                  rows={rows}
                  reload={load}
                />
              )}
              {tab === "assessments" && (
                <AssessmentWorkspace
                  key={scope}
                  tenant={tenant}
                  actor={user}
                  access={access}
                  rows={rows}
                  reload={load}
                />
              )}
              {tab === "windows" && (
                <>
                  <section>
                    <h2>Scheduled sittings</h2>
                    <ul className="records">
                      {(rows["exam-windows"] ?? []).map((row) => (
                        <li key={row.id}>
                          <strong>{String(row.title)}</strong>
                          <span>
                            {new Date(String(row.opens_at)).toLocaleString()} –{" "}
                            {new Date(String(row.closes_at)).toLocaleString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <h2>Register a candidate</h2>
                    <form
                      onSubmit={prevent(async () => {
                        await command("registration.create", {
                          window_id: windowId,
                          candidate_id: candidate,
                        });
                        setNotice("Candidate registered.");
                      })}
                    >
                      <label>
                        Sitting
                        <select
                          required
                          value={windowId}
                          onChange={(e) => setWindowId(e.target.value)}
                        >
                          <option value="">Choose a sitting</option>
                          {(rows["exam-windows"] ?? []).map((row) => (
                            <option key={row.id} value={row.id}>
                              {String(row.title)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Schood candidate account ID
                        <input
                          required
                          value={candidate}
                          onChange={(e) => setCandidate(e.target.value)}
                        />
                      </label>
                      <button disabled={busy}>Register candidate</button>
                    </form>
                    <p className="hint">
                      Use the candidate’s existing Schood account identifier.
                    </p>
                  </section>
                  <section className="editor">
                    <h2>Schedule an exam</h2>
                    <form
                      onSubmit={prevent(async () => {
                        await command("window.create", {
                          title,
                          assessment_version_id: selectedVersion,
                          opens_at: new Date(opens).toISOString(),
                          closes_at: new Date(closes).toISOString(),
                        });
                        setNotice("Exam sitting scheduled.");
                      })}
                    >
                      <label>
                        Sitting title
                        <input
                          required
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                        />
                      </label>
                      <label>
                        Published assessment
                        <select
                          required
                          value={selectedVersion}
                          onChange={(e) => setSelectedVersion(e.target.value)}
                        >
                          <option value="">Choose an assessment</option>
                          {(rows["assessment-versions"] ?? []).map((row) => (
                            <option key={row.id} value={row.id}>
                              {String((row.definition as Definition).title)} ·{" "}
                              {String(row.version)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Opens at
                        <input
                          type="datetime-local"
                          required
                          value={opens}
                          onChange={(e) => setOpens(e.target.value)}
                        />
                      </label>
                      <label>
                        Closes at
                        <input
                          type="datetime-local"
                          required
                          value={closes}
                          onChange={(e) => setCloses(e.target.value)}
                        />
                      </label>
                      <button disabled={busy}>Schedule exam</button>
                    </form>
                  </section>
                </>
              )}
            </div>
          </Suspense>
        )}
      </main>
      <footer>
        Schood Assessment Cloud · Institution-controlled assessment
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

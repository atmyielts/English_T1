import { OperationalPendingNotice } from './OperationalPendingNotice';
import { getLocaleTag, translate } from '../../i18n';
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CalendarClock, CheckCircle2, GitBranch, PhoneCall, Plus, RefreshCw, UsersRound } from "lucide-react";
import { teacherStudioBusinessFoundation, teacherStudioConvertLead, teacherStudioCreateLead, teacherStudioRecordLeadActivity, teacherStudioScheduleTrial, teacherStudioSetTrialStatus, teacherStudioTransitionLead, teacherStudioUpsertBranch, teacherStudioUpsertRoom, type AcademyBusinessFoundation, type AcademyLead, type AcademyPipelineStage, type AcademyTrialLesson } from "../../lib/client";
import { QuickLeadDialog } from './QuickLeadDialog';

type BusinessTab = "pipeline" | "followups" | "trials" | "branches";

type Props = {
  academyId: string;
  actorId: string;
  formatDate: (value: string | null | undefined) => string;
};

const emptyLead = {
  full_name: "",
  phone: "",
  telegram: "",
  email: "",
  parent_name: "",
  parent_phone: "",
  age: "",
  interested_course: "",
  branch_id: "",
  source_id: "",
  campaign: "",
  expected_price: "",
  next_follow_up_at: "",
  notes: "",
};

const emptyActivity = {
  lead_id: "",
  activity_type: "follow_up",
  method: "call",
  status: "planned",
  due_at: "",
  outcome: "",
  notes: "",
  next_follow_up_at: "",
};

const emptyTrial = {
  lead_id: "",
  branch_id: "",
  room_id: "",
  classroom_id: "",
  teacher_user_id: "",
  starts_at: "",
  ends_at: "",
};

const emptyTrialOutcome = {
  trial_id: "",
  status: "attended" as AcademyTrialLesson["status"],
  feedback: "",
  recommended_course: "",
  recommended_level: "",
  next_step: "",
};

const labelFromI18n = (value: Record<string, string> | null | undefined, fallback: string): string => value?.en || value?.uz || value?.ru || fallback;

const localDateTimeToIso = (value: string): string => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Enter a valid date and time.");
  return date.toISOString();
};

const money = (amount: number | null | undefined, currency = "UZS"): string => (amount == null ? "—" : `${new Intl.NumberFormat(getLocaleTag()).format(amount)} ${currency}`);

export function BusinessFoundationView({ academyId, actorId, formatDate }: Props) {
  const [data, setData] = useState<AcademyBusinessFoundation | null>(null);
  const [tab, setTab] = useState<BusinessTab>("pipeline");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [leadForm, setLeadForm] = useState(emptyLead);
  const [activityForm, setActivityForm] = useState(emptyActivity);
  const [trialForm, setTrialForm] = useState(emptyTrial);
  const [trialOutcome, setTrialOutcome] = useState(emptyTrialOutcome);
  const [branchForm, setBranchForm] = useState({
    branch_key: "",
    name: "",
    address: "",
    phone: "",
    capacity: "",
  });
  const [roomForm, setRoomForm] = useState({
    branch_id: "",
    room_key: "",
    name: "",
    capacity: "12",
    room_type: "classroom",
  });
  const [conversionForm, setConversionForm] = useState({
    lead_id: "",
    classroom_id: "",
    trial_id: "",
  });
  const [transitionTargets, setTransitionTargets] = useState<Record<string, string>>({});
  const [transitionReasons, setTransitionReasons] = useState<Record<string, string>>({});
  const [leadFilters, setLeadFilters] = useState({
    query: "",
    assigned_user_id: "",
    source_id: "",
    branch_id: "",
    course: "",
    created_from: "",
    created_to: "",
    attention: "all",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await teacherStudioBusinessFoundation(academyId);
      setData(next);
      const defaultBranch = next.branches.find((branch) => branch.is_default) ?? next.branches[0];
      const firstOpenLead = next.leads.find((lead) => lead.status === "open");
      setLeadForm((previous) => ({
        ...previous,
        branch_id: previous.branch_id || defaultBranch?.id || "",
      }));
      setActivityForm((previous) => ({
        ...previous,
        lead_id: previous.lead_id || firstOpenLead?.id || "",
      }));
      setTrialForm((previous) => ({
        ...previous,
        lead_id: previous.lead_id || firstOpenLead?.id || "",
        branch_id: previous.branch_id || defaultBranch?.id || "",
      }));
      setRoomForm((previous) => ({
        ...previous,
        branch_id: previous.branch_id || defaultBranch?.id || "",
      }));
      setConversionForm((previous) => ({
        ...previous,
        lead_id: previous.lead_id || firstOpenLead?.id || "",
      }));
      setTrialOutcome((previous) => ({
        ...previous,
        trial_id: previous.trial_id || next.trials.find((trial) => !["cancelled", "converted"].includes(trial.status))?.id || "",
      }));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Unable to load admissions.");
    } finally {
      setLoading(false);
    }
  }, [academyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const stages = useMemo(() => [...(data?.stages ?? [])].sort((a, b) => a.position - b.position), [data?.stages]);
  const openLeads = useMemo(() => (data?.leads ?? []).filter((lead) => lead.status === "open"), [data?.leads]);
  const stageById = useMemo(() => new Map(stages.map((stage) => [stage.id, stage])), [stages]);
  const branchById = useMemo(() => new Map((data?.branches ?? []).map((branch) => [branch.id, branch])), [data?.branches]);
  const leadById = useMemo(() => new Map((data?.leads ?? []).map((lead) => [lead.id, lead])), [data?.leads]);
  const sourceById = useMemo(() => new Map((data?.sources ?? []).map((source) => [source.id, source])), [data?.sources]);
  const roomById = useMemo(() => new Map((data?.rooms ?? []).map((room) => [room.id, room])), [data?.rooms]);
  const canManageBranches = data?.access?.permissions.manageBranches === true;
  const courses = useMemo(() => Array.from(new Set((data?.leads ?? []).map((lead) => lead.interested_course?.trim()).filter(Boolean) as string[])).sort(), [data?.leads]);
  const leadActivities = useMemo(() => {
    const byLead = new Map<string, AcademyBusinessFoundation["activities"]>();
    for (const activity of data?.activities ?? []) byLead.set(activity.lead_id, [...(byLead.get(activity.lead_id) ?? []), activity]);
    return byLead;
  }, [data?.activities]);
  const filteredLeads = useMemo(() => {
    const now = Date.now();
    const staleBefore = now - 72 * 60 * 60 * 1000;
    const recentAfter = now - 24 * 60 * 60 * 1000;
    const query = leadFilters.query.trim().toLowerCase();
    const from = leadFilters.created_from ? new Date(`${leadFilters.created_from}T00:00:00`).getTime() : null;
    const to = leadFilters.created_to ? new Date(`${leadFilters.created_to}T23:59:59.999`).getTime() : null;
    return (data?.leads ?? []).filter((lead) => {
      const created = new Date(lead.created_at).getTime();
      const lastContact = lead.last_contacted_at ? new Date(lead.last_contacted_at).getTime() : null;
      const nextFollowUp = lead.next_follow_up_at ? new Date(lead.next_follow_up_at).getTime() : null;
      const haystack = [lead.full_name, lead.phone, lead.telegram, lead.email, lead.parent_name, lead.interested_course, lead.notes].filter(Boolean).join(" ").toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (leadFilters.assigned_user_id && lead.assigned_user_id !== leadFilters.assigned_user_id) return false;
      if (leadFilters.source_id && lead.source_id !== leadFilters.source_id) return false;
      if (leadFilters.branch_id && lead.branch_id !== leadFilters.branch_id) return false;
      if (leadFilters.course && lead.interested_course !== leadFilters.course) return false;
      if (from !== null && created < from) return false;
      if (to !== null && created > to) return false;
      if (leadFilters.attention === "stale" && !(lead.status === "open" && (lastContact ?? created) < staleBefore)) return false;
      if (leadFilters.attention === "overdue" && !(lead.status === "open" && nextFollowUp !== null && nextFollowUp < now)) return false;
      if (leadFilters.attention === "untouched" && !(lead.status === "open" && !lead.last_contacted_at && (leadActivities.get(lead.id)?.length ?? 0) === 0)) return false;
      if (leadFilters.attention === "no_next_action" && !(lead.status === "open" && !lead.next_follow_up_at)) return false;
      if (leadFilters.attention === "recent" && created < recentAfter) return false;
      return true;
    });
  }, [data?.leads, leadActivities, leadFilters]);

  const run = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await work();
      setNotice(success);
      await load();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "The operation failed.");
    } finally {
      setBusy(false);
    }
  };

  const submitLead = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      await teacherStudioCreateLead(academyId, {
        ...leadForm,
        age: leadForm.age ? Number(leadForm.age) : null,
        expected_price: leadForm.expected_price ? Number(leadForm.expected_price) : null,
        next_follow_up_at: leadForm.next_follow_up_at ? localDateTimeToIso(leadForm.next_follow_up_at) : null,
        idempotency_key: crypto.randomUUID(),
      },actorId);
      setLeadForm((previous) => ({
        ...emptyLead,
        branch_id: previous.branch_id,
      }));
    }, "Lead captured and added to the admissions pipeline.");
  };

  const moveLead = async (lead: AcademyLead, requestedStageId?: string) => {
    const toStageId = requestedStageId ?? transitionTargets[lead.id];
    if (!toStageId) {
      setError("Choose the next stage first.");
      return;
    }
    const target = stageById.get(toStageId);
    if (!validTargets(lead).some((stage) => stage.id === toStageId)) {
      setError("That pipeline transition is not allowed.");
      return;
    }
    const reason = transitionReasons[lead.id] ?? "";
    if (target?.terminal_kind === "lost" && !reason.trim()) {
      setError("A lost reason is required.");
      return;
    }
    await run(
      () =>
        teacherStudioTransitionLead(academyId, {
          lead_id: lead.id,
          to_stage_id: toStageId,
          reason,
          idempotency_key: crypto.randomUUID(),
        }),
      `${lead.full_name} moved to ${labelFromI18n(target?.label_i18n, target?.stage_key ?? "the next stage")}.`,
    );
  };

  const submitActivity = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      await teacherStudioRecordLeadActivity(academyId, {
        ...activityForm,
        due_at: activityForm.due_at ? localDateTimeToIso(activityForm.due_at) : null,
        next_follow_up_at: activityForm.next_follow_up_at ? localDateTimeToIso(activityForm.next_follow_up_at) : null,
        idempotency_key: crypto.randomUUID(),
      });
      setActivityForm((previous) => ({
        ...emptyActivity,
        lead_id: previous.lead_id,
      }));
    }, "Follow-up activity recorded.");
  };

  const submitTrial = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      await teacherStudioScheduleTrial(academyId, {
        ...trialForm,
        starts_at: localDateTimeToIso(trialForm.starts_at),
        ends_at: localDateTimeToIso(trialForm.ends_at),
        idempotency_key: crypto.randomUUID(),
      });
      setTrialForm((previous) => ({
        ...emptyTrial,
        lead_id: previous.lead_id,
        branch_id: previous.branch_id,
      }));
    }, "Trial lesson scheduled.");
  };

  const submitTrialOutcome = async (event: FormEvent) => {
    event.preventDefault();
    await run(
      () =>
        teacherStudioSetTrialStatus(academyId, {
          ...trialOutcome,
          idempotency_key: crypto.randomUUID(),
        }),
      "Trial status and feedback saved.",
    );
  };

  const submitConversion = async (event: FormEvent) => {
    event.preventDefault();
    await run(
      () =>
        teacherStudioConvertLead(academyId, {
          ...conversionForm,
          classroom_id: conversionForm.classroom_id || null,
          trial_id: conversionForm.trial_id || null,
          idempotency_key: crypto.randomUUID(),
        }),
      "Lead converted into a student contact and enrollment.",
    );
  };

  const submitBranch = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      await teacherStudioUpsertBranch(academyId, {
        ...branchForm,
        capacity: branchForm.capacity ? Number(branchForm.capacity) : null,
      });
      setBranchForm({
        branch_key: "",
        name: "",
        address: "",
        phone: "",
        capacity: "",
      });
    }, "Branch created.");
  };

  const submitRoom = async (event: FormEvent) => {
    event.preventDefault();
    await run(async () => {
      await teacherStudioUpsertRoom(academyId, {
        ...roomForm,
        capacity: Number(roomForm.capacity),
        room_type: roomForm.room_type as "classroom",
      });
      setRoomForm((previous) => ({
        branch_id: previous.branch_id,
        room_key: "",
        name: "",
        capacity: "12",
        room_type: "classroom",
      }));
    }, "Room created.");
  };

  const validTargets = (lead: AcademyLead): AcademyPipelineStage[] => {
    const ids = new Set((data?.transitions ?? []).filter((transition) => transition.from_stage_id === lead.current_stage_id).map((transition) => transition.to_stage_id));
    return stages.filter((stage) => ids.has(stage.id) && stage.terminal_kind !== "won");
  };

  const today = useMemo(() => new Date(), []);
  const overdue = (data?.activities ?? []).filter((activity) => activity.status === "planned" && activity.due_at && new Date(activity.due_at) < today);
  const todayTrials = (data?.trials ?? []).filter((trial) => new Date(trial.starts_at).toDateString() === today.toDateString() && !["cancelled", "converted"].includes(trial.status));
  const staffWorkload = useMemo(
    () =>
      (data?.staff ?? [])
        .filter((staff) => staff.user_id)
        .map((staff) => {
          const assigned = openLeads.filter((lead) => lead.assigned_user_id === staff.user_id);
          const leadIds = new Set(assigned.map((lead) => lead.id));
          return {
            id: staff.id,
            name: staff.display_name || staff.role,
            assigned: assigned.length,
            overdue: overdue.filter((activity) => leadIds.has(activity.lead_id)).length,
            dueToday: (data?.activities ?? []).filter((activity) => leadIds.has(activity.lead_id) && activity.status === "planned" && activity.due_at && new Date(activity.due_at).toDateString() === today.toDateString()).length,
          };
        })
        .filter((row) => row.assigned || row.overdue || row.dueToday),
    [data?.activities, data?.staff, openLeads, overdue, today],
  );

  if (loading && !data)
    return (
      <section className="panel">
        <p>{translate("Loading admissions and branches…")}</p>
      </section>
    );

  return (
    <section className="business-os">
      <OperationalPendingNotice academyId={academyId} actorId={actorId} onRecovered={load} />
      <div className="section-heading business-os__heading">
        <div>
          <span className="eyebrow">{translate("Growth + operations foundation")}</span>
          <h2>{translate("Admissions and branches")}</h2>
          <p>{translate("Run the real path from first inquiry through trial, conversion, and group enrollment.")}</p>
        </div>
        <div className="row wrap">
        {data?.access?.permissions.manageAdmissions ? <QuickLeadDialog key={`${actorId}:${academyId}`} actorId={actorId} academyId={academyId} branches={data.branches} preferredBranchId={leadFilters.branch_id} disabled={loading || busy} onSaved={async (lead) => { setNotice(lead.duplicate_phone ? 'Lead saved. Another inquiry in this branch uses this phone number; review both before merging.' : 'Lead captured and added to the admissions pipeline.'); await load(); }} /> : null}
        <button className="ghost-btn" type="button" onClick={() => void load()} disabled={loading || busy}>
          <RefreshCw size={16} /> {translate("Refresh")}{' '}</button>
        </div>
      </div>

      <div className="business-os__stats" aria-label={translate("Admissions summary")}>
        <article>
          <UsersRound size={18} />
          <span>{translate("Open leads")}</span>
          <strong>{openLeads.length}</strong>
        </article>
        <article>
          <CalendarClock size={18} />
          <span>{translate("Trials today")}</span>
          <strong>{todayTrials.length}</strong>
        </article>
        <article>
          <PhoneCall size={18} />
          <span>{translate("Overdue follow-ups")}</span>
          <strong>{overdue.length}</strong>
        </article>
        <article>
          <Building2 size={18} />
          <span>{translate("Active branches")}</span>
          <strong>{data?.branches.filter((branch) => branch.is_active).length ?? 0}</strong>
        </article>
      </div>

      {error ? <div className="error-banner">{translate(error)}</div> : null}
      {notice ? <div className="info-banner">{translate(notice)}</div> : null}

      <div className="business-os__tabs" role="group" aria-label={translate("Business foundation views")}>
        {(
          [
            ["pipeline", "Pipeline"],
            ["followups", "Follow-ups"],
            ["trials", "Trials"],
            ["branches", "Branches & rooms"],
          ] as Array<[BusinessTab, string]>
        ).map(([id, label]) => (
          <button key={id} type="button" className={tab === id ? "is-active" : ""} aria-pressed={tab === id} onClick={() => setTab(id)}>
            {translate(label)}
          </button>
        ))}
      </div>

      {tab === "pipeline" ? (
        <>
          <div className="business-os__split">
            <form className="panel compact-form business-os__lead-form" onSubmit={submitLead}>
              <div className="section-heading business-os__form-heading">
                <div>
                  <span className="eyebrow">{translate("New inquiry")}</span>
                  <h3>{translate("Capture lead")}</h3>
                </div>
                <span className="business-os__form-icon" aria-hidden="true">
                  <Plus size={18} />
                </span>
              </div>
              <label>
                {translate("Full name")}{' '}<input
                  className="input"
                  value={leadForm.full_name}
                  onChange={(event) =>
                    setLeadForm((previous) => ({
                      ...previous,
                      full_name: event.target.value,
                    }))
                  }
                  required
                />
              </label>
              <div className="form-grid two-col">
                <label>
                  {translate("Phone")}{' '}<input
                    className="input"
                    value={leadForm.phone}
                    onChange={(event) =>
                      setLeadForm((previous) => ({
                        ...previous,
                        phone: event.target.value,
                      }))
                    }
                    placeholder="+998 90 123 45 67"
                  />
                </label>
                <label>
                  {translate("Telegram")}{' '}<input
                    className="input"
                    value={leadForm.telegram}
                    onChange={(event) =>
                      setLeadForm((previous) => ({
                        ...previous,
                        telegram: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label>
                {translate("Email")}{' '}<input
                  className="input"
                  type="email"
                  value={leadForm.email}
                  onChange={(event) =>
                    setLeadForm((previous) => ({
                      ...previous,
                      email: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="form-grid two-col">
                <label>
                  {translate("Source")}{' '}<select
                    className="input"
                    value={leadForm.source_id}
                    onChange={(event) =>
                      setLeadForm((previous) => ({
                        ...previous,
                        source_id: event.target.value,
                      }))
                    }
                  >
                    <option value="">{translate("Unspecified")}</option>
                    {data?.sources.map((source) => (
                      <option key={source.id} value={source.id}>
                        {labelFromI18n(source.label_i18n, source.source_key)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {translate("Branch")}{' '}<select
                    className="input"
                    value={leadForm.branch_id}
                    onChange={(event) =>
                      setLeadForm((previous) => ({
                        ...previous,
                        branch_id: event.target.value,
                      }))
                    }
                  >
                    {data?.branches
                      .filter((branch) => branch.is_active)
                      .map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <label>
                {translate("Interested course")}{' '}<input
                  className="input"
                  value={leadForm.interested_course}
                  onChange={(event) =>
                    setLeadForm((previous) => ({
                      ...previous,
                      interested_course: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="form-grid two-col">
                <label>
                  {translate("Expected price")}{' '}<input
                    className="input"
                    type="number"
                    min="0"
                    value={leadForm.expected_price}
                    onChange={(event) =>
                      setLeadForm((previous) => ({
                        ...previous,
                        expected_price: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  {translate("Campaign")}{' '}<input
                    className="input"
                    value={leadForm.campaign}
                    onChange={(event) =>
                      setLeadForm((previous) => ({
                        ...previous,
                        campaign: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label>
                {translate("Next follow-up")}{' '}<input
                  className="input"
                  type="datetime-local"
                  value={leadForm.next_follow_up_at}
                  onChange={(event) =>
                    setLeadForm((previous) => ({
                      ...previous,
                      next_follow_up_at: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                {translate("Notes")}{' '}<textarea
                  className="input"
                  value={leadForm.notes}
                  onChange={(event) =>
                    setLeadForm((previous) => ({
                      ...previous,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>
              <button className="primary-btn" disabled={busy}>
                {translate("Add lead")}{' '}</button>
            </form>

            <form className="panel compact-form" onSubmit={submitConversion}>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">{translate("Won")}</span>
                  <h3>{translate("Convert to student")}</h3>
                </div>
                <CheckCircle2 size={18} />
              </div>
              <label>
                {translate("Lead")}{' '}<select
                  className="input"
                  value={conversionForm.lead_id}
                  onChange={(event) =>
                    setConversionForm((previous) => ({
                      ...previous,
                      lead_id: event.target.value,
                      trial_id: "",
                    }))
                  }
                  required
                >
                  <option value="">{translate("Choose lead")}</option>
                  {openLeads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {translate("Group / classroom")}{' '}<select
                  className="input"
                  value={conversionForm.classroom_id}
                  onChange={(event) =>
                    setConversionForm((previous) => ({
                      ...previous,
                      classroom_id: event.target.value,
                    }))
                  }
                >
                  <option value="">{translate("Create contact only")}</option>
                  {data?.classrooms.map((classroom) => (
                    <option key={classroom.id} value={classroom.id}>
                      {classroom.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {translate("Attended trial")}{' '}<select
                  className="input"
                  value={conversionForm.trial_id}
                  onChange={(event) =>
                    setConversionForm((previous) => ({
                      ...previous,
                      trial_id: event.target.value,
                    }))
                  }
                >
                  <option value="">{translate("No linked trial")}</option>
                  {data?.trials
                    .filter((trial) => trial.lead_id === conversionForm.lead_id && trial.status === "attended")
                    .map((trial) => (
                      <option key={trial.id} value={trial.id}>
                        {formatDate(trial.starts_at)}
                      </option>
                    ))}
                </select>
              </label>
              <p className="muted">{translate("Conversion reuses a matching contact when possible and creates an active classroom enrollment when a group is chosen.")}</p>
              <button className="primary-btn" disabled={busy || !conversionForm.lead_id}>
                {translate("Convert lead")}{' '}</button>
            </form>
          </div>

          <section className="panel pipeline-filters" aria-label={translate("Pipeline filters")}>
            <div className="section-heading">
              <div>
                <span className="eyebrow">{translate("Focus the queue")}</span>
                <h3>{translate("Find leads that need action")}</h3>
              </div>
              <strong>{filteredLeads.length} {translate("shown")}</strong>
            </div>
            <div className="pipeline-filters__grid">
              <label>
                {translate("Search")}{' '}<input
                  className="input"
                  type="search"
                  value={leadFilters.query}
                  onChange={(event) =>
                    setLeadFilters((previous) => ({
                      ...previous,
                      query: event.target.value,
                    }))
                  }
                  placeholder={translate("Name, phone, course, parent…")}
                />
              </label>
              <label>
                {translate("Employee")}{' '}<select
                  className="input"
                  value={leadFilters.assigned_user_id}
                  onChange={(event) =>
                    setLeadFilters((previous) => ({
                      ...previous,
                      assigned_user_id: event.target.value,
                    }))
                  }
                >
                  <option value="">{translate("All employees")}</option>
                  {data?.staff
                    .filter((staff) => staff.user_id)
                    .map((staff) => (
                      <option key={staff.id} value={staff.user_id ?? ""}>
                        {staff.display_name || staff.role}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {translate("Source")}{' '}<select
                  className="input"
                  value={leadFilters.source_id}
                  onChange={(event) =>
                    setLeadFilters((previous) => ({
                      ...previous,
                      source_id: event.target.value,
                    }))
                  }
                >
                  <option value="">{translate("All sources")}</option>
                  {data?.sources.map((source) => (
                    <option key={source.id} value={source.id}>
                      {labelFromI18n(source.label_i18n, source.source_key)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {translate("Branch")}{' '}<select
                  className="input"
                  value={leadFilters.branch_id}
                  onChange={(event) =>
                    setLeadFilters((previous) => ({
                      ...previous,
                      branch_id: event.target.value,
                    }))
                  }
                >
                  <option value="">{translate("All branches")}</option>
                  {data?.branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {translate("Course")}{' '}<select
                  className="input"
                  value={leadFilters.course}
                  onChange={(event) =>
                    setLeadFilters((previous) => ({
                      ...previous,
                      course: event.target.value,
                    }))
                  }
                >
                  <option value="">{translate("All courses")}</option>
                  {courses.map((course) => (
                    <option key={course} value={course}>
                      {course}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {translate("Attention")}{' '}<select
                  className="input"
                  value={leadFilters.attention}
                  onChange={(event) =>
                    setLeadFilters((previous) => ({
                      ...previous,
                      attention: event.target.value,
                    }))
                  }
                >
                  <option value="all">{translate("All leads")}</option>
                  <option value="overdue">{translate("Overdue follow-up")}</option>
                  <option value="stale">{translate("Stale 72+ hours")}</option>
                  <option value="untouched">{translate("Untouched")}</option>
                  <option value="no_next_action">{translate("No next action")}</option>
                  <option value="recent">{translate("Recent inbound 24h")}</option>
                </select>
              </label>
              <label>
                {translate("Created from")}{' '}<input
                  className="input"
                  type="date"
                  value={leadFilters.created_from}
                  onChange={(event) =>
                    setLeadFilters((previous) => ({
                      ...previous,
                      created_from: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                {translate("Created to")}{' '}<input
                  className="input"
                  type="date"
                  value={leadFilters.created_to}
                  onChange={(event) =>
                    setLeadFilters((previous) => ({
                      ...previous,
                      created_to: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <button
              className="ghost-btn"
              type="button"
              onClick={() =>
                setLeadFilters({
                  query: "",
                  assigned_user_id: "",
                  source_id: "",
                  branch_id: "",
                  course: "",
                  created_from: "",
                  created_to: "",
                  attention: "all",
                })
              }
            >
              {translate("Clear filters")}{' '}</button>
          </section>

          <div className="pipeline-board" aria-label={translate("Admissions pipeline")}>
            {stages.map((stage) => {
              const stageLeads = filteredLeads.filter((lead) => lead.current_stage_id === stage.id);
              return (
                <section
                  className={`pipeline-column pipeline-column--${stage.terminal_kind ?? "active"}`}
                  key={stage.id}
                  onDragOver={(event) => {
                    if (stage.terminal_kind !== "lost" && stage.terminal_kind !== "won") event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const lead = leadById.get(event.dataTransfer.getData("application/x-schood-lead"));
                    if (lead && stage.terminal_kind !== "lost" && stage.terminal_kind !== "won") void moveLead(lead, stage.id);
                  }}
                >
                  <header>
                    <div>
                      <strong>{labelFromI18n(stage.label_i18n, stage.stage_key)}</strong>
                      <span>{stage.probability_percent}%</span>
                    </div>
                    <b>{stageLeads.length}</b>
                  </header>
                  <div className="pipeline-column__cards">
                    {stageLeads.length === 0 ? (
                      <p className="empty-state">{translate("No leads")}</p>
                    ) : (
                      stageLeads.map((lead) => {
                        const targets = validTargets(lead);
                        const selectedTarget = stageById.get(transitionTargets[lead.id] ?? "");
                        return (
                          <article
                            className="lead-card"
                            key={lead.id}
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("application/x-schood-lead", lead.id);
                            }}
                          >
                            <div className="lead-card__top">
                              <strong>{lead.full_name}</strong>
                              <span className={`status-pill ${lead.status}`}>{lead.status}</span>
                            </div>
                            <p>{lead.interested_course || "Course not chosen"}</p>
                            <dl>
                              <div>
                                <dt>{translate("Source")}</dt>
                                <dd>{lead.source_id ? labelFromI18n(sourceById.get(lead.source_id)?.label_i18n, "Other") : "Unspecified"}</dd>
                              </div>
                              <div>
                                <dt>{translate("Value")}</dt>
                                <dd>{money(lead.expected_price, lead.currency)}</dd>
                              </div>
                            </dl>
                            {lead.next_follow_up_at ? <small>{translate("Follow-up")}{' '}{formatDate(lead.next_follow_up_at)}</small> : <small className="warning-text">{translate("No next follow-up")}</small>}
                            {targets.length > 0 ? (
                              <div className="lead-card__transition">
                                <select
                                  className="input"
                                  aria-label={`Next stage for ${lead.full_name}`}
                                  value={transitionTargets[lead.id] ?? ""}
                                  onChange={(event) =>
                                    setTransitionTargets((previous) => ({
                                      ...previous,
                                      [lead.id]: event.target.value,
                                    }))
                                  }
                                >
                                  <option value="">{translate("Move to…")}</option>
                                  {targets.map((target) => (
                                    <option key={target.id} value={target.id}>
                                      {labelFromI18n(target.label_i18n, target.stage_key)}
                                    </option>
                                  ))}
                                </select>
                                {selectedTarget?.terminal_kind === "lost" ? (
                                  <input
                                    className="input"
                                    placeholder={translate("Lost reason")}
                                    value={transitionReasons[lead.id] ?? ""}
                                    onChange={(event) =>
                                      setTransitionReasons((previous) => ({
                                        ...previous,
                                        [lead.id]: event.target.value,
                                      }))
                                    }
                                  />
                                ) : null}
                                <button className="ghost-btn" type="button" onClick={() => void moveLead(lead)} disabled={busy}>
                                  {translate("Move")}{' '}</button>
                              </div>
                            ) : null}
                          </article>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      ) : null}

      {tab === "followups" ? (
        <div className="business-os__split">
          <form className="panel compact-form" onSubmit={submitActivity}>
            <div className="section-heading">
              <div>
                <span className="eyebrow">{translate("Activity")}</span>
                <h3>{translate("Record follow-up")}</h3>
              </div>
              <PhoneCall size={18} />
            </div>
            <label>
              {translate("Lead")}{' '}<select
                className="input"
                value={activityForm.lead_id}
                onChange={(event) =>
                  setActivityForm((previous) => ({
                    ...previous,
                    lead_id: event.target.value,
                  }))
                }
                required
              >
                {openLeads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.full_name}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-grid two-col">
              <label>
                {translate("Method")}{' '}<select
                  className="input"
                  value={activityForm.method}
                  onChange={(event) =>
                    setActivityForm((previous) => ({
                      ...previous,
                      method: event.target.value,
                    }))
                  }
                >
                  <option value="call">{translate("Call")}</option>
                  <option value="telegram">{translate("Telegram")}</option>
                  <option value="sms">{translate("SMS")}</option>
                  <option value="email">{translate("Email")}</option>
                  <option value="in_person">{translate("In person")}</option>
                </select>
              </label>
              <label>
                {translate("Status")}{' '}<select
                  className="input"
                  value={activityForm.status}
                  onChange={(event) =>
                    setActivityForm((previous) => ({
                      ...previous,
                      status: event.target.value,
                    }))
                  }
                >
                  <option value="planned">{translate("Planned")}</option>
                  <option value="completed">{translate("Completed")}</option>
                  <option value="missed">{translate("Missed")}</option>
                  <option value="cancelled">{translate("Cancelled")}</option>
                </select>
              </label>
            </div>
            <label>
              {translate("Due / occurred at")}{' '}<input
                className="input"
                type="datetime-local"
                value={activityForm.due_at}
                onChange={(event) =>
                  setActivityForm((previous) => ({
                    ...previous,
                    due_at: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              {translate("Outcome")}{' '}<input
                className="input"
                value={activityForm.outcome}
                onChange={(event) =>
                  setActivityForm((previous) => ({
                    ...previous,
                    outcome: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              {translate("Next follow-up")}{' '}<input
                className="input"
                type="datetime-local"
                value={activityForm.next_follow_up_at}
                onChange={(event) =>
                  setActivityForm((previous) => ({
                    ...previous,
                    next_follow_up_at: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              {translate("Notes")}{' '}<textarea
                className="input"
                value={activityForm.notes}
                onChange={(event) =>
                  setActivityForm((previous) => ({
                    ...previous,
                    notes: event.target.value,
                  }))
                }
              />
            </label>
            <button className="primary-btn" disabled={busy || !activityForm.lead_id}>
              {translate("Save activity")}{' '}</button>
          </form>
          <div className="business-os__stack">
            <section className="panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">{translate("Daily queue")}</span>
                  <h3>{translate("Due and recent")}</h3>
                </div>
              </div>
              <div className="record-list">
                {(data?.activities ?? []).map((activity) => (
                  <article key={activity.id} className={activity.status === "planned" && activity.due_at && new Date(activity.due_at) < today ? "is-overdue" : ""}>
                    <div>
                      <strong>{leadById.get(activity.lead_id)?.full_name ?? "Lead"}</strong>
                      <p>
                        {activity.method || activity.activity_type} · {activity.outcome || activity.status}
                      </p>
                    </div>
                    <span>{formatDate(activity.due_at || activity.completed_at || activity.created_at)}</span>
                  </article>
                ))}
                {(data?.activities.length ?? 0) === 0 ? <p className="empty-state">{translate("No activities yet.")}</p> : null}
              </div>
            </section>
            <section className="panel">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">{translate("Manager workload")}</span>
                  <h3>{translate("Ownership and follow-through")}</h3>
                </div>
              </div>
              <div className="record-list">
                {staffWorkload.map((row) => (
                  <article key={row.id}>
                    <div>
                      <strong>{row.name}</strong>
                      <p>
                        {row.assigned} {translate("open leads ·")}{' '}{row.dueToday} {translate("due today")}{' '}</p>
                    </div>
                    <span className={row.overdue ? "warning-text" : ""}>{row.overdue} {translate("overdue")}</span>
                  </article>
                ))}
                {staffWorkload.length === 0 ? <p className="empty-state">{translate("Assign leads to see workload.")}</p> : null}
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {tab === "trials" ? (
        <div className="business-os__split business-os__split--wide">
          <div className="stacked-forms">
            <form className="panel compact-form" onSubmit={submitTrial}>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">{translate("Booking")}</span>
                  <h3>{translate("Schedule trial")}</h3>
                </div>
                <CalendarClock size={18} />
              </div>
              <label>
                {translate("Lead")}{' '}<select
                  className="input"
                  value={trialForm.lead_id}
                  onChange={(event) =>
                    setTrialForm((previous) => ({
                      ...previous,
                      lead_id: event.target.value,
                    }))
                  }
                  required
                >
                  {openLeads.map((lead) => (
                    <option key={lead.id} value={lead.id}>
                      {lead.full_name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="form-grid two-col">
                <label>
                  {translate("Branch")}{' '}<select
                    className="input"
                    value={trialForm.branch_id}
                    onChange={(event) =>
                      setTrialForm((previous) => ({
                        ...previous,
                        branch_id: event.target.value,
                        room_id: "",
                      }))
                    }
                    required
                  >
                    {data?.branches
                      .filter((branch) => branch.is_active)
                      .map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  {translate("Room")}{' '}<select
                    className="input"
                    value={trialForm.room_id}
                    onChange={(event) =>
                      setTrialForm((previous) => ({
                        ...previous,
                        room_id: event.target.value,
                      }))
                    }
                  >
                    <option value="">{translate("Not assigned")}</option>
                    {data?.rooms
                      .filter((room) => room.branch_id === trialForm.branch_id && room.is_active)
                      .map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.name} ({room.capacity})
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <label>
                {translate("Group / classroom")}{' '}<select
                  className="input"
                  value={trialForm.classroom_id}
                  onChange={(event) =>
                    setTrialForm((previous) => ({
                      ...previous,
                      classroom_id: event.target.value,
                    }))
                  }
                >
                  <option value="">{translate("Not assigned")}</option>
                  {data?.classrooms.map((classroom) => (
                    <option key={classroom.id} value={classroom.id}>
                      {classroom.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {translate("Teacher")}{' '}<select
                  className="input"
                  value={trialForm.teacher_user_id}
                  onChange={(event) =>
                    setTrialForm((previous) => ({
                      ...previous,
                      teacher_user_id: event.target.value,
                    }))
                  }
                >
                  <option value="">{translate("Not assigned")}</option>
                  {data?.staff
                    .filter((staff) => staff.user_id && ["teacher", "assistant"].includes(staff.role))
                    .map((staff) => (
                      <option key={staff.id} value={staff.user_id ?? ""}>
                        {staff.display_name || staff.role}
                      </option>
                    ))}
                </select>
              </label>
              <div className="form-grid two-col">
                <label>
                  {translate("Starts")}{' '}<input
                    className="input"
                    type="datetime-local"
                    value={trialForm.starts_at}
                    onChange={(event) =>
                      setTrialForm((previous) => ({
                        ...previous,
                        starts_at: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
                <label>
                  {translate("Ends")}{' '}<input
                    className="input"
                    type="datetime-local"
                    value={trialForm.ends_at}
                    onChange={(event) =>
                      setTrialForm((previous) => ({
                        ...previous,
                        ends_at: event.target.value,
                      }))
                    }
                    required
                  />
                </label>
              </div>
              <button className="primary-btn" disabled={busy}>
                {translate("Schedule trial")}{' '}</button>
            </form>
            <form className="panel compact-form" onSubmit={submitTrialOutcome}>
              <div className="section-heading">
                <div>
                  <span className="eyebrow">{translate("Teacher feedback")}</span>
                  <h3>{translate("Complete trial")}</h3>
                </div>
              </div>
              <label>
                {translate("Trial")}{' '}<select
                  className="input"
                  value={trialOutcome.trial_id}
                  onChange={(event) =>
                    setTrialOutcome((previous) => ({
                      ...previous,
                      trial_id: event.target.value,
                    }))
                  }
                  required
                >
                  {data?.trials
                    .filter((trial) => ["scheduled", "confirmed", "rescheduled", "missed", "attended"].includes(trial.status))
                    .map((trial) => (
                      <option key={trial.id} value={trial.id}>
                        {leadById.get(trial.lead_id)?.full_name} · {formatDate(trial.starts_at)} · {trial.status}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {translate("Outcome")}{' '}<select
                  className="input"
                  value={trialOutcome.status}
                  onChange={(event) =>
                    setTrialOutcome((previous) => ({
                      ...previous,
                      status: event.target.value as AcademyTrialLesson["status"],
                    }))
                  }
                >
                  <option value="confirmed">{translate("Confirmed")}</option>
                  <option value="attended">{translate("Attended")}</option>
                  <option value="missed">{translate("Missed")}</option>
                  <option value="cancelled">{translate("Cancelled")}</option>
                  <option value="rescheduled">{translate("Rescheduled")}</option>
                </select>
              </label>
              <label>
                {translate("Feedback")}{' '}<textarea
                  className="input"
                  value={trialOutcome.feedback}
                  onChange={(event) =>
                    setTrialOutcome((previous) => ({
                      ...previous,
                      feedback: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="form-grid two-col">
                <label>
                  {translate("Recommended course")}{' '}<input
                    className="input"
                    value={trialOutcome.recommended_course}
                    onChange={(event) =>
                      setTrialOutcome((previous) => ({
                        ...previous,
                        recommended_course: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  {translate("Level")}{' '}<input
                    className="input"
                    value={trialOutcome.recommended_level}
                    onChange={(event) =>
                      setTrialOutcome((previous) => ({
                        ...previous,
                        recommended_level: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <label>
                {translate("Next step")}{' '}<input
                  className="input"
                  value={trialOutcome.next_step}
                  onChange={(event) =>
                    setTrialOutcome((previous) => ({
                      ...previous,
                      next_step: event.target.value,
                    }))
                  }
                />
              </label>
              <button className="primary-btn" disabled={busy || !trialOutcome.trial_id}>
                {translate("Save outcome")}{' '}</button>
            </form>
          </div>
          <section className="panel">
            <div className="section-heading">
              <div>
                <span className="eyebrow">{translate("Trial calendar")}</span>
                <h3>{translate("Bookings and outcomes")}</h3>
              </div>
            </div>
            <div className="trial-list">
              {(data?.trials ?? []).map((trial) => (
                <article key={trial.id}>
                  <div>
                    <strong>{leadById.get(trial.lead_id)?.full_name ?? "Lead"}</strong>
                    <p>
                      {branchById.get(trial.branch_id)?.name} · {trial.room_id ? roomById.get(trial.room_id)?.name : "Room not assigned"}
                    </p>
                    <small>{trial.feedback || trial.next_step || "Awaiting feedback"}</small>
                  </div>
                  <div>
                    <span className={`status-pill ${trial.status}`}>{translate(trial.status.replace("_", " "))}</span>
                    <time>{formatDate(trial.starts_at)}</time>
                  </div>
                </article>
              ))}
              {(data?.trials.length ?? 0) === 0 ? <p className="empty-state">{translate("No trials scheduled.")}</p> : null}
            </div>
          </section>
        </div>
      ) : null}

      {tab === "branches" ? (
        <>
          {canManageBranches ? (
            <div className="business-os__split">
              <form className="panel compact-form" onSubmit={submitBranch}>
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">{translate("Organization")}</span>
                    <h3>{translate("Add branch")}</h3>
                  </div>
                  <Building2 size={18} />
                </div>
                <div className="form-grid two-col">
                  <label>
                    {translate("Key")}{' '}<input
                      className="input"
                      value={branchForm.branch_key}
                      onChange={(event) =>
                        setBranchForm((previous) => ({
                          ...previous,
                          branch_key: event.target.value,
                        }))
                      }
                      placeholder={translate("chilanzar")}
                      required
                    />
                  </label>
                  <label>
                    {translate("Name")}{' '}<input
                      className="input"
                      value={branchForm.name}
                      onChange={(event) =>
                        setBranchForm((previous) => ({
                          ...previous,
                          name: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                </div>
                <label>
                  {translate("Address")}{' '}<input
                    className="input"
                    value={branchForm.address}
                    onChange={(event) =>
                      setBranchForm((previous) => ({
                        ...previous,
                        address: event.target.value,
                      }))
                    }
                  />
                </label>
                <div className="form-grid two-col">
                  <label>
                    {translate("Phone")}{' '}<input
                      className="input"
                      value={branchForm.phone}
                      onChange={(event) =>
                        setBranchForm((previous) => ({
                          ...previous,
                          phone: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    {translate("Total capacity")}{' '}<input
                      className="input"
                      type="number"
                      min="0"
                      value={branchForm.capacity}
                      onChange={(event) =>
                        setBranchForm((previous) => ({
                          ...previous,
                          capacity: event.target.value,
                        }))
                      }
                    />
                  </label>
                </div>
                <button className="primary-btn" disabled={busy}>
                  {translate("Add branch")}{' '}</button>
              </form>
              <form className="panel compact-form" onSubmit={submitRoom}>
                <div className="section-heading">
                  <div>
                    <span className="eyebrow">{translate("Capacity")}</span>
                    <h3>{translate("Add physical room")}</h3>
                  </div>
                  <GitBranch size={18} />
                </div>
                <label>
                  {translate("Branch")}{' '}<select
                    className="input"
                    value={roomForm.branch_id}
                    onChange={(event) =>
                      setRoomForm((previous) => ({
                        ...previous,
                        branch_id: event.target.value,
                      }))
                    }
                    required
                  >
                    {data?.branches
                      .filter((branch) => branch.is_active)
                      .map((branch) => (
                        <option key={branch.id} value={branch.id}>
                          {branch.name}
                        </option>
                      ))}
                  </select>
                </label>
                <div className="form-grid two-col">
                  <label>
                    {translate("Key")}{' '}<input
                      className="input"
                      value={roomForm.room_key}
                      onChange={(event) =>
                        setRoomForm((previous) => ({
                          ...previous,
                          room_key: event.target.value,
                        }))
                      }
                      placeholder={translate("room-101")}
                      required
                    />
                  </label>
                  <label>
                    {translate("Name")}{' '}<input
                      className="input"
                      value={roomForm.name}
                      onChange={(event) =>
                        setRoomForm((previous) => ({
                          ...previous,
                          name: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                </div>
                <div className="form-grid two-col">
                  <label>
                    {translate("Capacity")}{' '}<input
                      className="input"
                      type="number"
                      min="1"
                      value={roomForm.capacity}
                      onChange={(event) =>
                        setRoomForm((previous) => ({
                          ...previous,
                          capacity: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                  <label>
                    {translate("Type")}{' '}<select
                      className="input"
                      value={roomForm.room_type}
                      onChange={(event) =>
                        setRoomForm((previous) => ({
                          ...previous,
                          room_type: event.target.value,
                        }))
                      }
                    >
                      <option value="classroom">{translate("Classroom")}</option>
                      <option value="lab">{translate("Lab")}</option>
                      <option value="meeting">{translate("Meeting")}</option>
                      <option value="office">{translate("Office")}</option>
                      <option value="online">{translate("Online")}</option>
                      <option value="other">{translate("Other")}</option>
                    </select>
                  </label>
                </div>
                <button className="primary-btn" disabled={busy}>
                  {translate("Add room")}{' '}</button>
              </form>
            </div>
          ) : null}
          <div className="branch-grid">
            {data?.branches.map((branch) => {
              const rooms = data.rooms.filter((room) => room.branch_id === branch.id);
              const roomCapacity = rooms.reduce((sum, room) => sum + room.capacity, 0);
              return (
                <article className="panel" key={branch.id}>
                  <header>
                    <div>
                      <strong>{branch.name}</strong>
                      <span>{branch.branch_key}</span>
                    </div>
                    {branch.is_default ? <span className="status-pill active">{translate("Main")}</span> : null}
                  </header>
                  <p>{branch.address || translate("Address not set")}</p>
                  <dl>
                    <div>
                      <dt>{translate("Rooms")}</dt>
                      <dd>{rooms.length}</dd>
                    </div>
                    <div>
                      <dt>{translate("Room seats")}</dt>
                      <dd>{roomCapacity}</dd>
                    </div>
                    <div>
                      <dt>{translate("Branch capacity")}</dt>
                      <dd>{branch.capacity ?? "—"}</dd>
                    </div>
                  </dl>
                  <div className="room-chips">
                    {rooms.map((room) => (
                      <span key={room.id}>
                        {room.name} · {room.capacity}
                      </span>
                    ))}
                    {rooms.length === 0 ? <small>{translate("No rooms yet")}</small> : null}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : null}
    </section>
  );
}

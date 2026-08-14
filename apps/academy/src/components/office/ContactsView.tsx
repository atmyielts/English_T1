import { getLocaleTag, translate } from '../../i18n';
import { useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from "react";
import { ArrowRight, Bell, BookOpenCheck, CreditCard, MessageSquare, Search, UserPlus } from "lucide-react";
import type { TeacherStudioAlert, TeacherStudioClassroom, TeacherStudioClassroomMembership, TeacherStudioContact, TeacherStudioEducationOS, TeacherStudioPayment } from "../../lib/client";
import type { ContactEnrichmentKey, ContactEnrichmentState, ContactFormState } from "./types";

type ContactTab = "overview" | "classrooms" | "attention" | "payments";
type ContactDestination = "classrooms" | "inbox" | "alerts" | "payments";

type ContactsViewProps = {
  busy: boolean;
  loading: boolean;
  form: ContactFormState;
  setForm: Dispatch<SetStateAction<ContactFormState>>;
  contacts: TeacherStudioContact[];
  classrooms: TeacherStudioClassroom[];
  classroomMemberships: TeacherStudioClassroomMembership[];
  alerts: TeacherStudioAlert[];
  payments: TeacherStudioPayment[];
  educationOS: TeacherStudioEducationOS | null;
  enrichmentState: ContactEnrichmentState;
  onRetryEnrichment: (key: ContactEnrichmentKey) => void;
  onSubmit: (e: FormEvent) => Promise<void>;
  onOpenClassroom: (classroomId: string) => void;
  onNavigate: (destination: ContactDestination) => void;
  statusClass: (status: string) => string;
  formatDate: (iso: string | null | undefined) => string;
  canManageContacts: boolean;
  canViewAlerts: boolean;
  canViewMessages: boolean;
  canViewPayments: boolean;
};

const contactName = (contact: TeacherStudioContact): string => `${contact.first_name} ${contact.last_name}`.trim() || contact.email || contact.id;

const filterContacts = (contacts: TeacherStudioContact[], query: string, statusFilter: string) => {
  const normalizedQuery = query.trim().toLowerCase();
  return contacts.filter((contact) => {
    if (statusFilter !== "all" && contact.status !== statusFilter) return false;
    if (!normalizedQuery) return true;
    return [contact.first_name, contact.last_name, contact.email, contact.phone, contact.placement_level].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery);
  });
};

export const ContactsView = ({ busy, loading, form, setForm, contacts, classrooms, classroomMemberships, alerts, payments, educationOS, enrichmentState, onRetryEnrichment, onSubmit, onOpenClassroom, onNavigate, statusClass, formatDate, canManageContacts, canViewAlerts, canViewMessages, canViewPayments }: ContactsViewProps) => {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedContactId, setSelectedContactId] = useState("");
  const [contactTab, setContactTab] = useState<ContactTab>("overview");
  const statuses = useMemo(() => Array.from(new Set(contacts.map((contact) => contact.status).filter(Boolean))).sort(), [contacts]);
  const visibleContacts = useMemo(() => filterContacts(contacts, query, statusFilter), [contacts, query, statusFilter]);

  const selectedContact = visibleContacts.find((contact) => contact.id === selectedContactId) ?? visibleContacts[0] ?? null;

  const reconcileSelection = (nextQuery: string, nextStatusFilter: string) => {
    const nextVisibleContacts = filterContacts(contacts, nextQuery, nextStatusFilter);
    if (!nextVisibleContacts.some((contact) => contact.id === selectedContact?.id)) {
      setSelectedContactId(nextVisibleContacts[0]?.id ?? "");
      setContactTab("overview");
    }
  };
  const selectedMemberships = selectedContact ? classroomMemberships.filter((membership) => membership.contact_id === selectedContact.id) : [];
  const classroomById = useMemo(() => new Map(classrooms.map((classroom) => [classroom.id, classroom])), [classrooms]);
  const selectedAlerts = selectedContact ? alerts.filter((alert) => alert.contact_id === selectedContact.id && !alert.resolved) : [];
  const selectedPayments = selectedContact ? payments.filter((payment) => payment.contact_id === selectedContact.id) : [];
  const paymentAttention = selectedPayments.filter((payment) => payment.status.toLowerCase() !== "paid");
  const selectedActions = selectedContact ? (educationOS?.action_queue ?? []).filter((item) => item.contact_id === selectedContact.id && ["open", "snoozed"].includes(item.status)) : [];
  const lifecycle = selectedContact ? (educationOS?.pipeline ?? []).find((item) => item.contact_id === selectedContact.id) : null;
  const classroomContextReady = enrichmentState.classrooms === "success" && enrichmentState.memberships === "success";
  const attentionContextReady = enrichmentState.educationOS === "success" && (!canViewAlerts || enrichmentState.alerts === "success") && (!canViewPayments || enrichmentState.payments === "success");

  const selectContact = (contactId: string) => {
    setSelectedContactId(contactId);
    setContactTab("overview");
  };

  return (
    <section className="workspace-section-stack">
      <header className="page-section-heading">
        <div>
          <span className="eyebrow">{translate("People")}</span>
          <h2>{canManageContacts ? "Students and contacts" : "My students"}</h2>
          <p>{translate("Select a person once to review their classroom, progress, attention, and permitted account context together.")}</p>
        </div>
      </header>

      {canManageContacts ? (
        <details className="panel workspace-create-disclosure">
          <summary>
            <UserPlus size={17} aria-hidden="true" /> {translate("Add contact")}{' '}</summary>
          <form className="workspace-form" onSubmit={onSubmit}>
            <div className="form-grid two-col">
              <label>
                {translate("First name")}{' '}<input className="input" autoComplete="given-name" value={form.first_name} onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))} required />
              </label>
              <label>
                {translate("Last name")}{' '}<input className="input" autoComplete="family-name" value={form.last_name} onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))} required />
              </label>
            </div>
            <div className="form-grid two-col">
              <label>
                {translate("Email")}{' '}<input className="input" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required />
              </label>
              <label>
                {translate("Phone")}{' '}<span className="optional-label">{translate("Optional")}</span>
                <input className="input" autoComplete="tel" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
              </label>
            </div>
            <div className="form-actions">
              <button className="primary-btn" type="submit" disabled={busy}>
                {translate("Save contact")}{' '}</button>
            </div>
          </form>
        </details>
      ) : null}

      <div className="contact-workspace-layout">
        <section className="panel workspace-directory" aria-busy={loading}>
          <div className="directory-toolbar">
            <label className="search-field">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">{translate("Search contacts")}</span>
              <input
                value={query}
                onChange={(event) => {
                  const nextQuery = event.target.value;
                  setQuery(nextQuery);
                  reconcileSelection(nextQuery, statusFilter);
                }}
                placeholder={translate("Search name, email, phone, or level")}
              />
            </label>
            <select
              className="input compact-input"
              aria-label={translate("Filter contacts by status")}
              value={statusFilter}
              onChange={(event) => {
                const nextStatus = event.target.value;
                setStatusFilter(nextStatus);
                reconcileSelection(query, nextStatus);
              }}
            >
              <option value="all">{translate("All statuses")}</option>
              {statuses.map((status) => (
                <option value={status} key={status}>
                  {status}
                </option>
              ))}
            </select>
            <span className="directory-count">
              {loading ? "Loading…" : `${visibleContacts.length} of ${contacts.length}`}
            </span>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{translate("Contact")}</th>
                  <th>{translate("Status")}</th>
                  <th>{translate("Level")}</th>
                  <th>{translate("Last updated")}</th>
                </tr>
              </thead>
              <tbody>
                {loading && contacts.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="table-loading-state" role="status">
                        {translate("Loading contacts…")}{' '}</div>
                    </td>
                  </tr>
                ) : null}
                {visibleContacts.map((contact) => {
                  const selected = selectedContact?.id === contact.id;
                  return (
                    <tr key={contact.id} className={selected ? "is-selected" : undefined}>
                      <td>
                        <button className="contact-row-button" type="button" aria-pressed={selected} onClick={() => selectContact(contact.id)}>
                          <strong>{contactName(contact)}</strong>
                          <span>
                            {contact.email ?? "No email"}
                            {contact.phone ? ` · ${contact.phone}` : ""}
                          </span>
                        </button>
                      </td>
                      <td>
                        <span className={statusClass(contact.status)}>{contact.status}</span>
                      </td>
                      <td>{contact.placement_level || <span className="muted">{translate("Not set")}</span>}</td>
                      <td>{formatDate(contact.updated_at)}</td>
                    </tr>
                  );
                })}
                {!loading && visibleContacts.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="table-empty-state">
                        <strong>{contacts.length === 0 ? "No contacts yet" : "No contacts match these filters"}</strong>
                        <span>{contacts.length === 0 ? "Add the first contact before assigning a classroom." : "Clear the search or choose another status."}</span>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="panel contact-context" aria-live="polite" aria-busy={loading || Object.values(enrichmentState).some((status) => status === "loading")}>
          {selectedContact ? (
            <>
              <header className="contact-context__header">
                <div>
                  <span className="eyebrow">{translate("Contact context")}</span>
                  <h3>{contactName(selectedContact)}</h3>
                  <p>{selectedContact.email || selectedContact.phone || "No contact channel recorded"}</p>
                </div>
                <span className={statusClass(selectedContact.status)}>{selectedContact.status}</span>
              </header>

              <div className="contact-context__tabs" aria-label={translate("Contact details")} role="group">
                {([["overview", "Overview"], ["classrooms", "Classrooms"], ["attention", "Attention"], ...(canViewPayments ? [["payments", "Payments"]] : [])] as Array<[ContactTab, string]>).map(([id, label]) => (
                  <button type="button" aria-pressed={contactTab === id} className={contactTab === id ? "is-active" : ""} onClick={() => setContactTab(id)} key={id}>
                    {translate(label)}
                  </button>
                ))}
              </div>

              {contactTab === "overview" ? (
                <div className="contact-context__body">
                  {enrichmentState.educationOS === "loading" ? (
                    <div className="contact-context-state" role="status">
                      {translate("Loading learning and lifecycle context…")}{' '}</div>
                  ) : null}
                  {enrichmentState.educationOS === "error" ? (
                    <div className="contact-context-state is-error" role="alert">
                      <strong>{translate("Learning and lifecycle context could not be loaded.")}</strong>
                      <button className="small-btn" type="button" onClick={() => onRetryEnrichment("educationOS")}>
                        {translate("Retry learning context")}{' '}</button>
                    </div>
                  ) : null}
                  {enrichmentState.memberships === "error" ? (
                    <div className="contact-context-state is-error" role="alert">
                      <strong>{translate("Classroom membership could not be loaded.")}</strong>
                      <button className="small-btn" type="button" onClick={() => onRetryEnrichment("memberships")}>
                        {translate("Retry classroom membership")}{' '}</button>
                    </div>
                  ) : null}
                  <div className="contact-signal-grid">
                    <div>
                      <span>{translate("Attendance")}</span>
                      <strong>{lifecycle?.attendance_rate == null ? "—" : `${lifecycle.attendance_rate}%`}</strong>
                    </div>
                    <div>
                      <span>{translate("Progress")}</span>
                      <strong>{lifecycle?.composite_score == null ? "—" : `${lifecycle.composite_score}%`}</strong>
                    </div>
                    <div>
                      <span>{translate("Classrooms")}</span>
                      <strong>{enrichmentState.memberships === "success" ? selectedMemberships.length : "—"}</strong>
                    </div>
                    <div>
                      <span>{translate("Needs attention")}</span>
                      <strong>{attentionContextReady ? selectedActions.length + selectedAlerts.length + (canViewPayments ? paymentAttention.length : 0) : "—"}</strong>
                    </div>
                  </div>
                  <dl className="contact-facts">
                    <div>
                      <dt>{translate("Lifecycle")}</dt>
                      <dd>{lifecycle?.derived_stage || selectedContact.lifecycle_stage || "Not set"}</dd>
                    </div>
                    <div>
                      <dt>{translate("Placement")}</dt>
                      <dd>
                        {selectedContact.placement_level || "Not set"}
                        {selectedContact.placement_score != null ? ` · ${selectedContact.placement_score}` : ""}
                      </dd>
                    </div>
                    <div>
                      <dt>{translate("Missing work")}</dt>
                      <dd>{lifecycle?.missing_assignments ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>{translate("Last activity")}</dt>
                      <dd>{formatDate(selectedContact.last_activity_at)}</dd>
                    </div>
                  </dl>
                  <div className="contact-quick-actions">
                    {selectedMemberships[0] ? (
                      <button className="small-btn" type="button" onClick={() => onOpenClassroom(selectedMemberships[0].classroom_id)}>
                        <BookOpenCheck size={15} /> {translate("Open classroom")}{' '}</button>
                    ) : null}
                    {canViewMessages ? (
                      <button className="small-btn" type="button" onClick={() => onNavigate("inbox")}>
                        <MessageSquare size={15} /> {translate("Message")}{' '}</button>
                    ) : null}
                    {canViewAlerts ? (
                      <button className="small-btn" type="button" onClick={() => onNavigate("alerts")}>
                        <Bell size={15} /> {translate("Alerts")}{' '}</button>
                    ) : null}
                    {canViewPayments ? (
                      <button className="small-btn" type="button" onClick={() => onNavigate("payments")}>
                        <CreditCard size={15} /> {translate("Finance")}{' '}</button>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {contactTab === "classrooms" ? (
                <div className="contact-context__body contact-record-list">
                  {enrichmentState.classrooms === "loading" || enrichmentState.memberships === "loading" ? (
                    <div className="contact-context-state" role="status">
                      {translate("Loading classroom information…")}{' '}</div>
                  ) : null}
                  {enrichmentState.classrooms === "error" ? (
                    <div className="contact-context-state is-error" role="alert">
                      <strong>{translate("Classroom details could not be loaded.")}</strong>
                      <button className="small-btn" type="button" onClick={() => onRetryEnrichment("classrooms")}>
                        {translate("Retry classroom details")}{' '}</button>
                    </div>
                  ) : null}
                  {enrichmentState.memberships === "error" ? (
                    <div className="contact-context-state is-error" role="alert">
                      <strong>{translate("Classroom membership could not be loaded.")}</strong>
                      <button className="small-btn" type="button" onClick={() => onRetryEnrichment("memberships")}>
                        {translate("Retry classroom membership")}{' '}</button>
                    </div>
                  ) : null}
                  {classroomContextReady
                    ? selectedMemberships.map((membership) => {
                        const classroom = classroomById.get(membership.classroom_id);
                        return (
                          <button type="button" onClick={() => onOpenClassroom(membership.classroom_id)} key={membership.id}>
                            <span>
                              <strong>{classroom?.name || membership.classroom_id}</strong>
                              <small>
                                {membership.role}
                                {membership.status ? ` · ${membership.status}` : ""}
                              </small>
                            </span>
                            <ArrowRight size={16} />
                          </button>
                        );
                      })
                    : null}
                  {classroomContextReady && selectedMemberships.length === 0 ? (
                    <div className="table-empty-state">
                      <strong>{translate("No classroom membership")}</strong>
                      <span>{translate("Add this contact to a classroom before assigning learning work.")}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {contactTab === "attention" ? (
                <div className="contact-context__body contact-attention-list">
                  {enrichmentState.educationOS === "loading" ? (
                    <div className="contact-context-state" role="status">
                      {translate("Loading action signals…")}{' '}</div>
                  ) : null}
                  {enrichmentState.educationOS === "error" ? (
                    <div className="contact-context-state is-error" role="alert">
                      <strong>{translate("Action signals could not be loaded.")}</strong>
                      <button className="small-btn" type="button" onClick={() => onRetryEnrichment("educationOS")}>
                        {translate("Retry action signals")}{' '}</button>
                    </div>
                  ) : null}
                  {canViewAlerts && enrichmentState.alerts === "loading" ? (
                    <div className="contact-context-state" role="status">
                      {translate("Loading alerts…")}{' '}</div>
                  ) : null}
                  {canViewAlerts && enrichmentState.alerts === "error" ? (
                    <div className="contact-context-state is-error" role="alert">
                      <strong>{translate("Alerts could not be loaded.")}</strong>
                      <button className="small-btn" type="button" onClick={() => onRetryEnrichment("alerts")}>
                        {translate("Retry alerts")}{' '}</button>
                    </div>
                  ) : null}
                  {enrichmentState.educationOS === "success"
                    ? selectedActions.map((item) => (
                        <article key={item.id}>
                          <div>
                            <span className={statusClass(item.priority)}>{item.priority}</span>
                            <strong>{item.title}</strong>
                          </div>
                          <p>{item.description}</p>
                          <time>{formatDate(item.due_at)}</time>
                        </article>
                      ))
                    : null}
                  {canViewAlerts && enrichmentState.alerts === "success"
                    ? selectedAlerts.map((alert) => (
                        <article key={alert.id}>
                          <div>
                            <span className={statusClass(alert.severity)}>{alert.severity}</span>
                            <strong>{alert.type}</strong>
                          </div>
                          <p>{alert.message}</p>
                          <time>{formatDate(alert.created_at)}</time>
                        </article>
                      ))
                    : null}
                  {enrichmentState.educationOS === "success" && (!canViewAlerts || enrichmentState.alerts === "success") && selectedActions.length === 0 && (!canViewAlerts || selectedAlerts.length === 0) ? (
                    <div className="table-empty-state">
                      <strong>{translate("No open attention items")}</strong>
                      <span>{translate("New risks, follow-ups, and permitted alerts will appear here.")}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {contactTab === "payments" && canViewPayments ? (
                <div className="contact-context__body contact-payment-list">
                  {enrichmentState.payments === "loading" ? (
                    <div className="contact-context-state" role="status">
                      {translate("Loading payment information…")}{' '}</div>
                  ) : null}
                  {enrichmentState.payments === "error" ? (
                    <div className="contact-context-state is-error" role="alert">
                      <strong>{translate("Payment information could not be loaded.")}</strong>
                      <button className="small-btn" type="button" onClick={() => onRetryEnrichment("payments")}>
                        {translate("Retry payment information")}{' '}</button>
                    </div>
                  ) : null}
                  {enrichmentState.payments === "success"
                    ? selectedPayments.map((payment) => (
                        <article key={payment.id}>
                          <div>
                            <strong>
                              {payment.amount.toLocaleString(getLocaleTag())} {payment.currency}
                            </strong>
                            <span className={statusClass(payment.status)}>{payment.status}</span>
                          </div>
                          <small>
                            {payment.provider || "manual"} · {formatDate(payment.created_at)}
                          </small>
                        </article>
                      ))
                    : null}
                  {enrichmentState.payments === "success" && selectedPayments.length === 0 ? (
                    <div className="table-empty-state">
                      <strong>{translate("No payments recorded")}</strong>
                      <span>{translate("Create a Click checkout from Finance when this contact is ready to pay.")}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : loading ? (
            <div className="table-loading-state" role="status">
              {translate("Loading contact details…")}{' '}</div>
          ) : (
            <div className="table-empty-state">
              <strong>{translate("Select a contact")}</strong>
              <span>{translate("Contact context will appear here without another route change.")}</span>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
};

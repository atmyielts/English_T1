import { translate } from '../../i18n';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type { TeacherStudioAlert, TeacherStudioContact } from '../../lib/client';
import type { AlertFormState } from './types';

type AlertsViewProps = {
  busy: boolean;
  contacts: TeacherStudioContact[];
  alerts: TeacherStudioAlert[];
  form: AlertFormState;
  setForm: Dispatch<SetStateAction<AlertFormState>>;
  onCreate: (e: FormEvent) => Promise<void>;
  onResolve: (alertId: string) => Promise<void>;
  formatDate: (iso: string | null | undefined) => string;
  canCreateAlerts: boolean;
  canCreateGlobalAlerts: boolean;
  canResolveAlerts: boolean;
};

const severityClass = (severity: string): string => {
  const value = severity.toLowerCase();
  if (value === 'critical' || value === 'high') return 'status status--bad';
  if (value === 'medium') return 'status status--pending';
  return 'status status--ok';
};

export const AlertsView = ({
  busy,
  contacts,
  alerts,
  form,
  setForm,
  onCreate,
  onResolve,
  formatDate,
  canCreateAlerts,
  canCreateGlobalAlerts,
  canResolveAlerts,
}: AlertsViewProps) => {
  const contactById = new Map(contacts.map((item) => [item.id, item]));

  return (
    <>
      {canCreateAlerts ? (
        <form className="panel workspace-form" onSubmit={onCreate}>
          <h3>{translate("Create alert")}</h3>
          <p className="small muted">{translate("Record an operational issue for the academy or a specific contact.")}</p>
          <label>{translate("Scope")}{' '}<select
              className="input"
              value={form.contact_id}
              onChange={(e) => setForm((previous) => ({ ...previous, contact_id: e.target.value }))}
            >
              {canCreateGlobalAlerts ? <option value="">{translate("Academy-wide alert")}</option> : null}
              {!canCreateGlobalAlerts ? <option value="">{translate("Select contact")}</option> : null}
              {contacts.map((item) => (
                <option key={item.id} value={item.id}>
                  {(item.first_name || item.last_name) ? `${item.first_name} ${item.last_name}`.trim() : item.email || item.id}
                </option>
              ))}
            </select>
          </label>
          <div className="grid two">
            <label>{translate("Alert type")}<input
              className="input"
              placeholder={translate("Attendance, progress, payment…")}
              value={form.type}
              onChange={(e) => setForm((previous) => ({ ...previous, type: e.target.value }))}
              required
            /></label>
            <label>{translate("Severity")}<select
              className="input"
              value={form.severity}
              onChange={(e) => setForm((previous) => ({ ...previous, severity: e.target.value }))}
            >
              <option value="low">{translate("low")}</option>
              <option value="medium">{translate("medium")}</option>
              <option value="high">{translate("high")}</option>
              <option value="critical">{translate("critical")}</option>
            </select></label>
          </div>
          <label>{translate("Message")}<textarea
            className="input"
            value={form.content}
            onChange={(e) => setForm((previous) => ({ ...previous, content: e.target.value }))}
            required
          /></label>
          <div className="form-actions"><button
            className="primary-btn"
            type="submit"
            disabled={busy || !form.type.trim() || !form.content.trim() || (!canCreateGlobalAlerts && !form.contact_id)}
          >
            {translate("Create alert")}{' '}</button></div>
        </form>
      ) : null}

      <section className="panel">
        <h3>{translate("Alert history")}</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{translate("Type")}</th>
                <th>{translate("Contact")}</th>
                <th>{translate("Message")}</th>
                <th>{translate("Severity")}</th>
                <th>{translate("Status")}</th>
                <th>{translate("Created")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {alerts.map((item) => {
                const contact = item.contact_id ? contactById.get(item.contact_id) : null;
                const contactLabel = contact
                  ? `${contact.first_name} ${contact.last_name}`.trim() || contact.email || contact.id
                  : 'Academy';
                return (
                  <tr key={item.id}>
                    <td>{item.type}</td>
                    <td>{contactLabel}</td>
                    <td>{item.message}</td>
                    <td><span className={severityClass(item.severity)}>{item.severity}</span></td>
                    <td>{item.resolved ? 'Resolved' : 'Open'}</td>
                    <td>{formatDate(item.created_at)}</td>
                    <td>
                      {!item.resolved && canResolveAlerts ? (
                        <button className="small-btn" type="button" disabled={busy} onClick={() => void onResolve(item.id)}>
                          {translate("Resolve")}{' '}</button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {alerts.length === 0 ? (
                <tr>
                  <td colSpan={7}><div className="table-empty-state"><strong>{translate("No alerts yet")}</strong><span>{translate("Operational issues will appear here when they need follow-up.")}</span></div></td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};

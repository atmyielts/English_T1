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
}: AlertsViewProps) => {
  const contactById = new Map(contacts.map((item) => [item.id, item]));

  return (
    <>
      <form className="panel" onSubmit={onCreate}>
        <h3>Create alert</h3>
        <select
          className="input"
          value={form.contact_id}
          onChange={(e) => setForm((previous) => ({ ...previous, contact_id: e.target.value }))}
        >
          <option value="">Academy-wide alert</option>
          {contacts.map((item) => (
            <option key={item.id} value={item.id}>
              {(item.first_name || item.last_name) ? `${item.first_name} ${item.last_name}`.trim() : item.email || item.id}
            </option>
          ))}
        </select>
        <div className="grid two">
          <input
            className="input"
            placeholder="Type (payment, attendance...)"
            value={form.type}
            onChange={(e) => setForm((previous) => ({ ...previous, type: e.target.value }))}
            required
          />
          <select
            className="input"
            value={form.severity}
            onChange={(e) => setForm((previous) => ({ ...previous, severity: e.target.value }))}
          >
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
            <option value="critical">critical</option>
          </select>
        </div>
        <textarea
          className="input"
          placeholder="Alert message"
          value={form.content}
          onChange={(e) => setForm((previous) => ({ ...previous, content: e.target.value }))}
          required
        />
        <button className="primary-btn" type="submit" disabled={busy || !form.type.trim() || !form.content.trim()}>
          Create alert
        </button>
      </form>

      <section className="panel">
        <h3>Alert history</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Contact</th>
                <th>Message</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Created</th>
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
                      {!item.resolved ? (
                        <button className="small-btn" type="button" disabled={busy} onClick={() => void onResolve(item.id)}>
                          Resolve
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
              {alerts.length === 0 ? (
                <tr>
                  <td colSpan={7}>No alerts yet.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};

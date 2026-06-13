import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type { TeacherStudioContact } from '../../lib/client';
import type { ContactFormState } from './types';

type ContactsViewProps = {
  busy: boolean;
  form: ContactFormState;
  setForm: Dispatch<SetStateAction<ContactFormState>>;
  contacts: TeacherStudioContact[];
  onSubmit: (e: FormEvent) => Promise<void>;
  statusClass: (status: string) => string;
  formatDate: (iso: string | null | undefined) => string;
  canManageContacts: boolean;
};

export const ContactsView = ({
  busy,
  form,
  setForm,
  contacts,
  onSubmit,
  statusClass,
  formatDate,
  canManageContacts,
}: ContactsViewProps) => {
  return (
    <section className={canManageContacts ? 'grid two' : ''}>
      {canManageContacts ? (
        <form className="panel" onSubmit={onSubmit}>
          <h3>Add contact</h3>
          <div className="grid two">
            <input className="input" placeholder="First name" value={form.first_name} onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))} required />
            <input className="input" placeholder="Last name" value={form.last_name} onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))} required />
          </div>
          <input className="input" placeholder="Email" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required />
          <input className="input" placeholder="Phone (optional)" value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
          <button className="primary-btn" type="submit" disabled={busy}>
            Save contact
          </button>
        </form>
      ) : null}

      <div className="panel">
        <h3>Contacts</h3>
        <ul className="list">
          {contacts.map((c) => (
            <li key={c.id}>
              <div className="row between">
                <strong>{`${c.first_name} ${c.last_name}`.trim() || c.id}</strong>
                <span className={statusClass(c.status)}>{c.status}</span>
              </div>
              <div className="muted small">{c.email ?? 'No email'} {c.phone ? ` | ${c.phone}` : ''}</div>
              <div className="muted small">Updated: {formatDate(c.updated_at)}</div>
            </li>
          ))}
          {contacts.length === 0 ? <li>No contacts yet.</li> : null}
        </ul>
      </div>
    </section>
  );
};


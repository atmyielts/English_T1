import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { translate } from '../../i18n';
import { teacherStudioCreateLead, type AcademyBranch, type AcademyLead } from '../../lib/client';
import {pendingOperational} from '../../lib/operationalRequest';
import {StaffRequestError} from '../../lib/staffRequest';

type Draft = { full_name: string; phone: string; interested_course: string; preferred_schedule: string; branch_id: string; source_key: string };
type Props = { academyId: string; actorId: string; branches: AcademyBranch[]; preferredBranchId?: string; disabled: boolean; onSaved: (lead: AcademyLead & {duplicate_phone?:boolean}) => Promise<void> };
const empty = (): Draft => ({ full_name: '', phone: '', interested_course: '', preferred_schedule: '', branch_id: '', source_key: 'walk_in' });

export function QuickLeadDialog({ academyId, actorId, branches, preferredBranchId, disabled, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const firstName = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const pending = useRef<(Draft & { idempotency_key: string }) | null>(null);
  const mutex = useRef(false);
  const opened = useRef(false);
  const visit = useRef(0);
  useEffect(() => () => { visit.current += 1; }, []);
  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) {
      dialog.current.showModal();
      if (!uncertain) firstName.current?.focus();
    }
    if (!open && dialog.current?.open) dialog.current.close();
    if (!open && !disabled && opened.current) opener.current?.focus();
  }, [open, disabled, uncertain]);
  useEffect(() => () => { if (dialog.current?.open) dialog.current.close(); }, []);
  const activeBranches = branches.filter(branch => branch.is_active);
  const close = () => { if (!mutex.current) setOpen(false); };
  const capture = () => {
    if (disabled) return;
    const restored=pendingOperational(academyId,actorId);
    if(restored&&restored.command!=='create_lead'){setError(translate('Confirm the pending inquiry or lesson change before starting another.'));setOpen(true);return;}
    if(restored){
      const payload=restored.payload as Draft & {idempotency_key:string};
      pending.current=payload;setDraft(payload);setUncertain(true);
    }else if(pending.current){pending.current=null;setDraft(empty());setUncertain(false);}
    opened.current = true;
    const branch = activeBranches.find(item => item.id === preferredBranchId) ?? activeBranches.find(item => item.is_default) ?? activeBranches[0];
    if (!pending.current) setDraft(previous => ({ ...previous, branch_id: previous.branch_id || branch?.id || '' }));
    setOpen(true);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (mutex.current || disabled) return;
    if (!pending.current && (!draft.full_name.trim() || !draft.phone.trim() || !draft.interested_course.trim())) {
      setError(translate('Enter a name, phone number and target subject.'));
      if (!draft.full_name.trim()) firstName.current?.focus();
      return;
    }
    mutex.current = true;
    const currentVisit = visit.current;
    const payload = pending.current ?? { ...draft, full_name: draft.full_name.trim(), phone: draft.phone.trim(), interested_course: draft.interested_course.trim(), idempotency_key: crypto.randomUUID() };
    pending.current = payload;
    setBusy(true); setError('');
    try {
      const lead = await teacherStudioCreateLead(academyId, payload,actorId);
      if (currentVisit !== visit.current) return;
      pending.current = null; setUncertain(false); setDraft(empty()); setOpen(false);
      await onSaved(lead);
    } catch (reason) {
      if (currentVisit !== visit.current) return;
      const definitiveRejection = reason instanceof StaffRequestError&&!reason.retryable;
      if (definitiveRejection) pending.current = null;
      const saveUnconfirmed = !definitiveRejection && pending.current !== null;
      setUncertain(saveUnconfirmed);
      setError(saveUnconfirmed
        ? translate('The save could not be confirmed. Retry to check it safely.')
        : translate('Unable to save the inquiry. Check the details or refresh the workspace, then try again.'));
    } finally {
      if (currentVisit === visit.current) { mutex.current = false; setBusy(false); }
    }
  };
  return <>
    <button ref={opener} className="primary-btn" type="button" disabled={disabled} onClick={capture}><Plus size={16} aria-hidden="true" /> {translate('Quick lead')}</button>
    {open ? <dialog ref={dialog} className="panel quick-lead-dialog" aria-labelledby={`quick-lead-${academyId}`} onCancel={event => { event.preventDefault(); close(); }}>
      <form className="workspace-form" aria-busy={busy} onSubmit={event => void save(event)}>
        <div className="row between wrap"><div><h2 id={`quick-lead-${academyId}`}>{translate('Quick lead')}</h2><p className="muted">{translate('Capture an inquiry now. Add the details later.')}</p></div><button className="ghost-btn" type="button" disabled={busy} onClick={close}>{translate('Close')}</button></div>
        {error ? <div className="error-banner" role="alert">{translate(error)}</div> : null}
        {uncertain ? <p className="info-banner" role="status">{translate('Your entry is kept. Retry saving before editing it.')}</p> : null}
        <fieldset className="quick-lead-fields" disabled={busy || uncertain}>
          <div className="row wrap" role="group" aria-label={translate('Inquiry channel')}>
            {([['walk_in', 'Walk-in'], ['phone', 'Phone']] as const).map(([value, label]) => <button key={value} className={draft.source_key === value ? 'small-btn primary-btn' : 'small-btn ghost-btn'} type="button" aria-pressed={draft.source_key === value} onClick={() => setDraft(previous => ({ ...previous, source_key: value }))}>{translate(label)}</button>)}
          </div>
          <label>{translate('Full name')}<input ref={firstName} className="input" autoComplete="name" required maxLength={180} value={draft.full_name} onChange={event => setDraft(previous => ({ ...previous, full_name: event.target.value }))} /></label>
          <label>{translate('Phone')}<input className="input" type="tel" autoComplete="tel" required maxLength={80} value={draft.phone} onChange={event => setDraft(previous => ({ ...previous, phone: event.target.value }))} /></label>
          <label>{translate('Target subject')}<input className="input" required maxLength={180} value={draft.interested_course} onChange={event => setDraft(previous => ({ ...previous, interested_course: event.target.value }))} /></label>
          <label>{translate('Preferred shift')}<select className="input" value={draft.preferred_schedule} onChange={event => setDraft(previous => ({ ...previous, preferred_schedule: event.target.value }))}><option value="">{translate('No preference')}</option><option value="morning">{translate('Morning')}</option><option value="evening">{translate('Evening')}</option></select></label>
          {activeBranches.length > 1 ? <label>{translate('Branch')}<select className="input" required value={draft.branch_id} onChange={event => setDraft(previous => ({ ...previous, branch_id: event.target.value }))}>{activeBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label> : null}
        </fieldset>
        <button className="primary-btn" type="submit" disabled={busy || disabled}>{translate(busy ? 'Saving…' : uncertain ? 'Retry saving' : 'Save lead')}</button>
      </form>
    </dialog> : null}
  </>;
}

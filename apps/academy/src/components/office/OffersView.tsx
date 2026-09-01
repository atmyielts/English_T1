import { translate } from '../../i18n';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import type { TeacherStudioOffer, TeacherStudioOfferGrant } from '../../lib/client';
import type { GrantFormState, OfferFormState } from './types';

type OffersViewProps = {
  busy: boolean;
  offerForm: OfferFormState;
  setOfferForm: Dispatch<SetStateAction<OfferFormState>>;
  grantForm: GrantFormState;
  setGrantForm: Dispatch<SetStateAction<GrantFormState>>;
  offers: TeacherStudioOffer[];
  offerGrants: TeacherStudioOfferGrant[];
  onCreateOffer: (e: FormEvent) => Promise<void>;
  onAttachGrant: (e: FormEvent) => Promise<void>;
};

export const OffersView = ({
  busy,
  offerForm,
  setOfferForm,
  grantForm,
  setGrantForm,
  offers,
  offerGrants,
  onCreateOffer,
  onAttachGrant,
}: OffersViewProps) => {
  return (
    <>
      <section className="grid two">
        <form className="panel workspace-form" onSubmit={onCreateOffer}>
          <h3>{translate("Create tuition plan")}</h3>
          <p className="small muted">{translate("Set the price and duration, then choose the learning products included after payment.")}</p>
          <label>{translate("Plan name")}<input className="input" value={offerForm.name} onChange={(e) => setOfferForm((p) => ({ ...p, name: e.target.value }))} required /></label>
          <div className="grid two">
            <label>{translate("Plan type")}<select className="input" value={offerForm.type} onChange={(e) => setOfferForm((p) => ({ ...p, type: e.target.value }))}>
              <option value="subscription">{translate("subscription")}</option>
              <option value="cohort">{translate("cohort")}</option>
              <option value="product">{translate("product")}</option>
              <option value="credits">{translate("credits")}</option>
            </select></label>
            <label>{translate("Currency")}<input className="input" value={offerForm.currency} onChange={(e) => setOfferForm((p) => ({ ...p, currency: e.target.value }))} /></label>
          </div>
          <div className="grid two">
            <label>{translate("Price")}<input className="input" type="number" min={0} value={offerForm.price_amount} onChange={(e) => setOfferForm((p) => ({ ...p, price_amount: e.target.value }))} required /></label>
            <label>{translate("Duration")}{' '}<span className="optional-label">{translate("Days, optional")}</span><input className="input" type="number" min={1} value={offerForm.duration_days} onChange={(e) => setOfferForm((p) => ({ ...p, duration_days: e.target.value }))} /></label>
          </div>
          <label>{translate("Description")}{' '}<span className="optional-label">{translate("Optional")}</span><textarea className="input" value={offerForm.description} onChange={(e) => setOfferForm((p) => ({ ...p, description: e.target.value }))} /></label>
          <div className="form-actions"><button className="primary-btn" type="submit" disabled={busy}>{translate("Create plan")}</button></div>
        </form>

        <form className="panel workspace-form" onSubmit={onAttachGrant}>
          <h3>{translate("Choose included access")}</h3>
          <p className="small muted">{translate("Choose what the student can open after this plan is paid.")}</p>
          <label>{translate("Tuition plan")}<select className="input" value={grantForm.offer_id} onChange={(e) => setGrantForm((p) => ({ ...p, offer_id: e.target.value }))} required>
            <option value="">{translate("Select a plan")}</option>
            {offers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select></label>
          <div className="grid two">
            <label>{translate("Access method")}<input className="input" value={grantForm.grant_type} onChange={(e) => setGrantForm((p) => ({ ...p, grant_type: e.target.value }))} required /></label>
            <label>{translate("What it opens")}{' '}<span className="optional-label">{translate("Optional")}</span><input className="input" value={grantForm.resource_type} onChange={(e) => setGrantForm((p) => ({ ...p, resource_type: e.target.value }))} /></label>
          </div>
          <details className="advanced-fields">
            <summary>{translate("Advanced targeting")}</summary>
            <div className="grid two">
              <label>{translate("Resource ID")}<input className="input" value={grantForm.resource_id} onChange={(e) => setGrantForm((p) => ({ ...p, resource_id: e.target.value }))} /></label>
              <label>{translate("Included product or feature")}<input className="input" value={grantForm.capability_key} onChange={(e) => setGrantForm((p) => ({ ...p, capability_key: e.target.value }))} /></label>
            </div>
          </details>
          <div className="form-actions"><button className="primary-btn" type="submit" disabled={busy}>{translate("Save included access")}</button></div>
        </form>
      </section>

      <section className="panel">
        <h3>{translate("Plans and included access")}</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{translate("Plan")}</th><th>{translate("Type")}</th><th>{translate("Price")}</th><th>{translate("Included access")}</th></tr></thead>
            <tbody>
              {offers.map((o) => {
                const grants = offerGrants.filter((g) => g.offer_id === o.id);
                return (
                  <tr key={o.id}>
                    <td>{o.name}</td>
                    <td>{o.type}</td>
                    <td>{o.price_amount} {o.currency}</td>
                    <td>{grants.length > 0 ? grants.map((g) => g.grant_type).join(', ') : '-'}</td>
                  </tr>
                );
              })}
              {offers.length === 0 ? <tr><td colSpan={4}><div className="table-empty-state"><strong>{translate("No tuition plans yet")}</strong><span>{translate("Create a plan before accepting a Click payment.")}</span></div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};

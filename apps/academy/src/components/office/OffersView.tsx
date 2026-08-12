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
          <h3>Create offer</h3>
          <p className="small muted">Define what a student buys. Access remains a separate grant attached below.</p>
          <label>Offer name<input className="input" value={offerForm.name} onChange={(e) => setOfferForm((p) => ({ ...p, name: e.target.value }))} required /></label>
          <div className="grid two">
            <label>Offer type<select className="input" value={offerForm.type} onChange={(e) => setOfferForm((p) => ({ ...p, type: e.target.value }))}>
              <option value="subscription">subscription</option>
              <option value="cohort">cohort</option>
              <option value="product">product</option>
              <option value="credits">credits</option>
            </select></label>
            <label>Currency<input className="input" value={offerForm.currency} onChange={(e) => setOfferForm((p) => ({ ...p, currency: e.target.value }))} /></label>
          </div>
          <div className="grid two">
            <label>Price<input className="input" type="number" min={0} value={offerForm.price_amount} onChange={(e) => setOfferForm((p) => ({ ...p, price_amount: e.target.value }))} required /></label>
            <label>Duration <span className="optional-label">Days, optional</span><input className="input" type="number" min={1} value={offerForm.duration_days} onChange={(e) => setOfferForm((p) => ({ ...p, duration_days: e.target.value }))} /></label>
          </div>
          <label>Description <span className="optional-label">Optional</span><textarea className="input" value={offerForm.description} onChange={(e) => setOfferForm((p) => ({ ...p, description: e.target.value }))} /></label>
          <div className="form-actions"><button className="primary-btn" type="submit" disabled={busy}>Create offer</button></div>
        </form>

        <form className="panel workspace-form" onSubmit={onAttachGrant}>
          <h3>Attach grant</h3>
          <p className="small muted">Specify the product, classroom, or capability unlocked after settlement.</p>
          <label>Offer<select className="input" value={grantForm.offer_id} onChange={(e) => setGrantForm((p) => ({ ...p, offer_id: e.target.value }))} required>
            <option value="">Select offer</option>
            {offers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select></label>
          <div className="grid two">
            <label>Grant type<input className="input" value={grantForm.grant_type} onChange={(e) => setGrantForm((p) => ({ ...p, grant_type: e.target.value }))} required /></label>
            <label>Resource type <span className="optional-label">Optional</span><input className="input" value={grantForm.resource_type} onChange={(e) => setGrantForm((p) => ({ ...p, resource_type: e.target.value }))} /></label>
          </div>
          <details className="advanced-fields">
            <summary>Advanced targeting</summary>
            <div className="grid two">
              <label>Resource ID<input className="input" value={grantForm.resource_id} onChange={(e) => setGrantForm((p) => ({ ...p, resource_id: e.target.value }))} /></label>
              <label>Capability key<input className="input" value={grantForm.capability_key} onChange={(e) => setGrantForm((p) => ({ ...p, capability_key: e.target.value }))} /></label>
            </div>
          </details>
          <div className="form-actions"><button className="primary-btn" type="submit" disabled={busy}>Save grant</button></div>
        </form>
      </section>

      <section className="panel">
        <h3>Offer grant map</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Offer</th><th>Type</th><th>Price</th><th>Grants</th></tr></thead>
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
              {offers.length === 0 ? <tr><td colSpan={4}><div className="table-empty-state"><strong>No offers yet</strong><span>Create an offer before accepting a Click checkout.</span></div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};

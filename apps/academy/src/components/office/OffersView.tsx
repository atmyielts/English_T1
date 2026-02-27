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
        <form className="panel" onSubmit={onCreateOffer}>
          <h3>Create offer</h3>
          <input className="input" placeholder="Offer name" value={offerForm.name} onChange={(e) => setOfferForm((p) => ({ ...p, name: e.target.value }))} required />
          <div className="grid two">
            <select className="input" value={offerForm.type} onChange={(e) => setOfferForm((p) => ({ ...p, type: e.target.value }))}>
              <option value="subscription">subscription</option>
              <option value="cohort">cohort</option>
              <option value="product">product</option>
              <option value="credits">credits</option>
            </select>
            <input className="input" placeholder="Currency" value={offerForm.currency} onChange={(e) => setOfferForm((p) => ({ ...p, currency: e.target.value }))} />
          </div>
          <div className="grid two">
            <input className="input" type="number" min={0} placeholder="Price" value={offerForm.price_amount} onChange={(e) => setOfferForm((p) => ({ ...p, price_amount: e.target.value }))} required />
            <input className="input" type="number" min={1} placeholder="Duration days" value={offerForm.duration_days} onChange={(e) => setOfferForm((p) => ({ ...p, duration_days: e.target.value }))} />
          </div>
          <textarea className="input" placeholder="Description" value={offerForm.description} onChange={(e) => setOfferForm((p) => ({ ...p, description: e.target.value }))} />
          <button className="primary-btn" type="submit" disabled={busy}>
            Create offer
          </button>
        </form>

        <form className="panel" onSubmit={onAttachGrant}>
          <h3>Attach grant</h3>
          <select className="input" value={grantForm.offer_id} onChange={(e) => setGrantForm((p) => ({ ...p, offer_id: e.target.value }))} required>
            <option value="">Select offer</option>
            {offers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <div className="grid two">
            <input className="input" placeholder="Grant type" value={grantForm.grant_type} onChange={(e) => setGrantForm((p) => ({ ...p, grant_type: e.target.value }))} required />
            <input className="input" placeholder="Resource type" value={grantForm.resource_type} onChange={(e) => setGrantForm((p) => ({ ...p, resource_type: e.target.value }))} />
          </div>
          <div className="grid two">
            <input className="input" placeholder="Resource ID" value={grantForm.resource_id} onChange={(e) => setGrantForm((p) => ({ ...p, resource_id: e.target.value }))} />
            <input className="input" placeholder="Capability key" value={grantForm.capability_key} onChange={(e) => setGrantForm((p) => ({ ...p, capability_key: e.target.value }))} />
          </div>
          <button className="primary-btn" type="submit" disabled={busy}>
            Save grant
          </button>
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
              {offers.length === 0 ? <tr><td colSpan={4}>No offers yet.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
};

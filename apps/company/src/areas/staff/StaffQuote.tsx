// /staff/contracts/:contract/quote — a printable commercial offer from what staff entered on
// the contract. No price list behind it, and nothing is added that staff did not type.
import React, { useEffect, useState } from 'react';
import { api } from '../../api.ts';
import { useAppT, type AppKey } from '../../i18n/index.ts';
import { Link } from '../../router.tsx';
import { Party } from '../people/InvoiceDocument.tsx';
import type { ContractView, PartyDetails } from '../people/types.ts';
import { useDates, useMoney, useProblem } from '../people/ui.tsx';
import { StaffFrame } from './common.tsx';

interface Data { contract: ContractView; org: { id: string; name: string }; buyer: PartyDetails; seller: PartyDetails | null; today: string }

export function StaffQuote({ contractId }: { contractId: string }) {
  const t = useAppT(), problem = useProblem(), { day } = useDates(), money = useMoney();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { api<Data>(`staff/contracts/${encodeURIComponent(contractId)}`).then(setData).catch((cause) => setError(problem(cause))); }, [contractId]);
  if (!data) return <StaffFrame title={t('staff.quote.title')}>{error ? <p className="error" role="alert">{error}</p> : <p role="status">{t('app.loading')}</p>}</StaffFrame>;
  const { contract, org, buyer, seller } = data;
  return <StaffFrame title={t('staff.quote.title')} lead={org.name} actions={<>
    <Link className="button-link quiet" to={`/staff/orgs/${org.id}`}>{t('staff.invoice.toWorkspace')}</Link>
    <button type="button" onClick={() => print()}>{t('people.doc.print')}</button>
  </>}>
    {!seller && <p className="notice no-print" role="status">{t('staff.billing.missing')} <Link to="/staff/billing">{t('staff.nav.billing')}</Link></p>}
    <article className="people-doc">
      <header className="people-doc-head">
        <div>
          <h1>{t('staff.quote.heading', { title: contract.title })}</h1>
          <p>{t('people.doc.dated', { date: day(data.today) })}</p>
          <p className="no-print"><span className="company-badge">{t(`staff.contract.status.${contract.status}` as AppKey)}</span></p>
        </div>
      </header>
      <div className="people-doc-parties">
        {seller && <Party title={t('people.doc.contractor')} party={seller}/>}
        <Party title={t('people.doc.customer')} party={buyer}/>
      </div>
      <div className="company-table-wrap people-doc-lines">
        <table className="company-table">
          <thead><tr>
            <th scope="col">{t('people.doc.line')}</th><th scope="col" className="people-num">{t('people.doc.quantity')}</th>
            <th scope="col" className="people-num">{t('people.doc.unitPrice')}</th><th scope="col" className="people-num">{t('people.doc.amount')}</th>
          </tr></thead>
          <tbody>
            <tr><td>{t('staff.quote.seats', { months: contract.term_months })}</td><td className="people-num">{contract.seats}</td><td className="people-num">{money(contract.price_per_seat)}</td><td className="people-num">{money(contract.seats * contract.price_per_seat)}</td></tr>
            {contract.tests_fee > 0 && <tr><td>{t('staff.quote.testsFee')}</td><td className="people-num">1</td><td className="people-num">{money(contract.tests_fee)}</td><td className="people-num">{money(contract.tests_fee)}</td></tr>}
          </tbody>
        </table>
      </div>
      <dl className="people-doc-totals">
        <div className="total"><dt>{t('people.doc.total')}</dt><dd>{money(contract.total)}</dd></div>
      </dl>
      <dl className="people-facts">
        <div><dt>{t('people.usage.seats')}</dt><dd>{contract.seats}</dd></div>
        <div><dt>{t('people.usage.tests')}</dt><dd>{contract.tests ?? t('people.usage.unlimited')}</dd></div>
        <div><dt>{t('staff.contract.term')}</dt><dd>{contract.term_months}</dd></div>
        {contract.start_date && <div><dt>{t('people.plan.period')}</dt><dd>{day(contract.start_date)} – {day(contract.end_date)}</dd></div>}
      </dl>
      <footer className="people-doc-signs">
        <div><span>{t('people.doc.contractor')}</span><span className="people-doc-sign">{seller?.director ?? ''}</span><small>{t('people.doc.signStamp')}</small></div>
      </footer>
    </article>
  </StaffFrame>;
}

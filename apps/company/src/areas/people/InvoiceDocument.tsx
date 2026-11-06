// The printable invoice and act. Seller and buyer are the details copied onto the document
// when it was issued, so what is printed never changes with later edits. Used by HR and staff.
import React from 'react';
import { useAppT } from '../../i18n/index.ts';
import type { InvoiceDetail, PartyDetails } from './types.ts';
import { useDates, useMoney } from './ui.tsx';

export function Party({ title, party }: { title: string; party: PartyDetails }) {
  const t = useAppT();
  const rows: [string, string | null | undefined][] = [
    [t('people.doc.stir'), party.tax_id],
    [t('people.doc.vatCode'), party.vat_code],
    [t('people.doc.bank'), party.bank_name],
    [t('people.doc.mfo'), party.mfo],
    [t('people.doc.account'), party.account],
    [t('people.doc.address'), party.address],
    [t('people.doc.phone'), party.phone],
    [t('people.doc.email'), party.email],
    [t('people.doc.director'), party.director],
  ];
  return <section className="people-doc-party">
    <h2>{title}</h2>
    <p className="people-doc-name">{party.legal_name || '—'}</p>
    <dl>{rows.filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </section>;
}

export function InvoiceDocument({ invoice, kind }: { invoice: InvoiceDetail; kind: 'invoice' | 'act' }) {
  const t = useAppT(), { day } = useDates(), money = useMoney();
  const act = kind === 'act';
  return <article className="people-doc">
    <header className="people-doc-head">
      <div>
        <h1>{act ? t('people.doc.actTitle', { number: invoice.act_number ?? '' }) : t('people.doc.invoiceTitle', { number: invoice.number })}</h1>
        <p>{act ? t('people.doc.actDated', { date: day(invoice.act_date), invoice: invoice.number }) : t('people.doc.dated', { date: day(invoice.issue_date) })}</p>
        {!act && invoice.due_date && <p>{t('people.doc.due', { date: day(invoice.due_date) })}</p>}
      </div>
    </header>
    <div className="people-doc-parties">
      <Party title={act ? t('people.doc.contractor') : t('people.doc.seller')} party={invoice.seller}/>
      <Party title={act ? t('people.doc.customer') : t('people.doc.buyer')} party={invoice.buyer}/>
    </div>
    {act && <p className="people-doc-lead">{t('people.doc.actLead', { seller: invoice.seller.legal_name ?? '', buyer: invoice.buyer.legal_name ?? '' })}</p>}
    <div className="company-table-wrap people-doc-lines">
      <table className="company-table">
        <thead><tr>
          <th scope="col">№</th><th scope="col">{t('people.doc.line')}</th><th scope="col" className="people-num">{t('people.doc.quantity')}</th>
          <th scope="col" className="people-num">{t('people.doc.unitPrice')}</th><th scope="col" className="people-num">{t('people.doc.amount')}</th>
        </tr></thead>
        <tbody>{invoice.lines.map((line, index) => <tr key={index}>
          <td>{index + 1}</td><td>{line.description}</td><td className="people-num">{line.quantity}</td>
          <td className="people-num">{money(line.unit_price)}</td><td className="people-num">{money(line.quantity * line.unit_price)}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <dl className="people-doc-totals">
      <div><dt>{t('people.doc.subtotal')}</dt><dd>{money(invoice.subtotal)}</dd></div>
      <div><dt>{Number(invoice.vat_percent) > 0 ? t('people.doc.vat', { percent: Number(invoice.vat_percent) }) : t('people.doc.noVat')}</dt><dd>{money(invoice.vat_amount)}</dd></div>
      <div className="total"><dt>{t('people.doc.total')}</dt><dd>{money(invoice.total)}</dd></div>
    </dl>
    {invoice.notes && <p className="people-doc-notes">{invoice.notes}</p>}
    {act && <p className="people-doc-lead">{t('people.doc.actClose')}</p>}
    <footer className="people-doc-signs">
      <div><span>{act ? t('people.doc.contractor') : t('people.doc.seller')}</span><span className="people-doc-sign">{invoice.seller.director ?? ''}</span><small>{t('people.doc.signStamp')}</small></div>
      {act && <div><span>{t('people.doc.customer')}</span><span className="people-doc-sign">{invoice.buyer.director ?? ''}</span><small>{t('people.doc.signStamp')}</small></div>}
    </footer>
  </article>;
}
